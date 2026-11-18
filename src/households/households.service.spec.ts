import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  HouseholdRelationship,
  MembershipRole,
  MembershipStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HouseholdsService } from './households.service.js';

describe('HouseholdsService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const membershipId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const memberId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const otherMembershipId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const resident: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Resident',
    email: 'r@example.com',
    platformRole: null,
  };
  const otherResident: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Other',
    email: 'o@example.com',
    platformRole: null,
  };
  const admin: AuthenticatedUser = {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Admin',
    email: 'a@example.com',
    platformRole: null,
  };

  const membershipFindFirst = vi.fn();
  const householdFindMany = vi.fn();
  const householdFindFirst = vi.fn();
  const householdFindUnique = vi.fn();
  const householdCreate = vi.fn();
  const householdUpdate = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();
  const assertCanAdministerSociety = vi.fn();
  const ensureSocietyExists = vi.fn();

  let service: HouseholdsService;

  const ownMembership = {
    id: membershipId,
    societyId,
    userId: resident.id,
    role: MembershipRole.RESIDENT_USER,
    status: MembershipStatus.ACTIVE,
    primaryUnitId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  };

  beforeEach(() => {
    for (const fn of [
      membershipFindFirst,
      householdFindMany,
      householdFindFirst,
      householdFindUnique,
      householdCreate,
      householdUpdate,
      auditCreate,
      transaction,
      assertCanAdministerSociety,
      ensureSocietyExists,
    ]) {
      fn.mockReset();
    }
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        householdMember: {
          create: householdCreate,
          update: householdUpdate,
        },
        auditLog: { create: auditCreate },
      }),
    );

    service = new HouseholdsService(
      {
        societyMembership: { findFirst: membershipFindFirst },
        householdMember: {
          findMany: householdFindMany,
          findFirst: householdFindFirst,
          findUnique: householdFindUnique,
          create: householdCreate,
          update: householdUpdate,
        },
        auditLog: { create: auditCreate },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
        ensureSocietyExists,
      } as unknown as AuthorizationService,
    );
  });

  it('lists own household members for a society membership', async () => {
    membershipFindFirst.mockResolvedValue(ownMembership);
    householdFindMany.mockResolvedValue([
      {
        id: memberId,
        membershipId,
        name: 'Aarav',
        relationship: HouseholdRelationship.CHILD,
        phone: null,
        email: null,
        isActive: true,
        createdByUserId: resident.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.listOwn(resident, societyId);
    expect(result.items).toHaveLength(1);
    expect(result.membershipId).toBe(membershipId);
  });

  it('creates a household member and rejects duplicates', async () => {
    membershipFindFirst.mockResolvedValue(ownMembership);
    householdFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: memberId,
    });
    householdCreate.mockResolvedValue({
      id: memberId,
      membershipId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
      phone: null,
      email: null,
      isActive: true,
      createdByUserId: resident.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await service.createOwn(resident, {
      societyId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
    });
    expect(created.name).toBe('Aarav');

    await expect(
      service.createOwn(resident, {
        societyId,
        name: 'Aarav',
        relationship: HouseholdRelationship.CHILD,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents another resident from managing a household member', async () => {
    householdFindUnique.mockResolvedValue({
      id: memberId,
      membershipId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
      phone: null,
      email: null,
      isActive: true,
      createdByUserId: resident.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      membership: ownMembership,
    });
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(
      service.deactivate(otherResident, memberId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deactivates a household member for the owner', async () => {
    householdFindUnique.mockResolvedValue({
      id: memberId,
      membershipId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
      phone: null,
      email: null,
      isActive: true,
      createdByUserId: resident.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      membership: ownMembership,
    });
    householdUpdate.mockResolvedValue({
      id: memberId,
      membershipId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
      phone: null,
      email: null,
      isActive: false,
      createdByUserId: resident.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.deactivate(resident, memberId);
    expect(result.isActive).toBe(false);
  });

  it('returns 404 when household member is missing', async () => {
    householdFindUnique.mockResolvedValue(null);
    await expect(
      service.update(resident, memberId, { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets admins create household members for a membership in their society', async () => {
    assertCanAdministerSociety.mockResolvedValue(undefined);
    membershipFindFirst.mockResolvedValue({
      ...ownMembership,
      id: otherMembershipId,
    });
    householdFindFirst.mockResolvedValue(null);
    householdCreate.mockResolvedValue({
      id: memberId,
      membershipId: otherMembershipId,
      name: 'Guest',
      relationship: HouseholdRelationship.OTHER,
      phone: null,
      email: null,
      isActive: true,
      createdByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await service.createAsAdmin(admin, societyId, {
      membershipId: otherMembershipId,
      name: 'Guest',
      relationship: HouseholdRelationship.OTHER,
    });
    expect(created.membershipId).toBe(otherMembershipId);
    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
  });
});
