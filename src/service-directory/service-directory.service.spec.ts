import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  ServiceCategory,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ServiceDirectoryService } from './service-directory.service.js';

describe('ServiceDirectoryService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const serviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'a@example.com',
    platformRole: null,
  };
  const resident: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Resident',
    email: 'r@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const assertCanViewSociety = vi.fn();
  const ensureSocietyExists = vi.fn();
  const create = vi.fn();
  const findMany = vi.fn();
  const count = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const membershipFindFirst = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();

  let service: ServiceDirectoryService;

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    assertCanViewSociety.mockReset().mockResolvedValue({
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
    });
    ensureSocietyExists.mockReset();
    for (const fn of [
      create,
      findMany,
      count,
      findUnique,
      update,
      membershipFindFirst,
      auditCreate,
      transaction,
    ]) {
      fn.mockReset();
    }
    auditCreate.mockResolvedValue({});
    transaction.mockImplementation(async (ops: unknown[]) => {
      const results = [];
      for (const op of ops as Array<Promise<unknown>>) {
        results.push(await op);
      }
      return results;
    });

    service = new ServiceDirectoryService(
      {
        serviceProvider: {
          create,
          findMany,
          count,
          findUnique,
          update,
        },
        societyMembership: { findFirst: membershipFindFirst },
        auditLog: { create: auditCreate },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
        assertCanViewSociety,
        ensureSocietyExists,
      } as unknown as AuthorizationService,
    );
  });

  it('creates providers for society admins', async () => {
    create.mockResolvedValue({
      id: serviceId,
      societyId,
      name: 'Shinde Plumbing',
      category: ServiceCategory.PLUMBING,
      description: null,
      contactPerson: null,
      phone: '+919876543210',
      whatsappNumber: null,
      address: null,
      isActive: true,
      createdByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create(admin, societyId, {
      name: 'Shinde Plumbing',
      category: ServiceCategory.PLUMBING,
      phone: '+919876543210',
    });

    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(result.name).toBe('Shinde Plumbing');
    expect(result.isActive).toBe(true);
  });

  it('rejects resident create attempts', async () => {
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());
    await expect(
      service.create(resident, societyId, {
        name: 'Hack',
        category: ServiceCategory.OTHER,
        phone: '+919876543210',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists only active providers for residents', async () => {
    assertCanViewSociety.mockResolvedValue({
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.ACTIVE,
    });
    membershipFindFirst.mockResolvedValue(null);
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([
      {
        id: serviceId,
        societyId,
        name: 'Active Electric',
        category: ServiceCategory.ELECTRICAL,
        description: null,
        contactPerson: null,
        phone: '+919811122233',
        whatsappNumber: null,
        address: null,
        isActive: true,
        createdByUserId: admin.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.list(resident, societyId, {
      category: ServiceCategory.ELECTRICAL,
    });

    expect(count).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          societyId,
          isActive: true,
          category: ServiceCategory.ELECTRICAL,
        }),
      }),
    );
  });

  it('hides inactive providers from residents on detail', async () => {
    findUnique.mockResolvedValue({
      id: serviceId,
      societyId,
      name: 'Hidden',
      category: ServiceCategory.OTHER,
      description: null,
      contactPerson: null,
      phone: '+919800011122',
      whatsappNumber: null,
      address: null,
      isActive: false,
      createdByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    membershipFindFirst.mockResolvedValue({
      role: MembershipRole.RESIDENT_USER,
    });

    await expect(service.get(resident, serviceId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('activates and deactivates providers for admins', async () => {
    findUnique.mockResolvedValue({
      id: serviceId,
      societyId,
      name: 'Provider',
      category: ServiceCategory.CARPENTRY,
      description: null,
      contactPerson: null,
      phone: '+919800011122',
      whatsappNumber: null,
      address: null,
      isActive: true,
      createdByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    update.mockResolvedValue({
      id: serviceId,
      societyId,
      name: 'Provider',
      category: ServiceCategory.CARPENTRY,
      description: null,
      contactPerson: null,
      phone: '+919800011122',
      whatsappNumber: null,
      address: null,
      isActive: false,
      createdByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const deactivated = await service.deactivate(admin, serviceId);
    expect(deactivated.isActive).toBe(false);
    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
  });
});
