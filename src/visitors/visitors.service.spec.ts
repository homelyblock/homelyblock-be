import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  UnitStatus,
  VisitorEntryType,
  VisitorStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VisitorsService } from './visitors.service.js';

describe('VisitorsService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const buildingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const otherUnitId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const visitorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const resident: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Resident',
    email: 'r@example.com',
    platformRole: null,
  };
  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'a@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const assertCanViewSociety = vi.fn();
  const ensureSocietyExists = vi.fn();
  const membershipFindFirst = vi.fn();
  const unitFindFirst = vi.fn();
  const visitorCreate = vi.fn();
  const visitorFindUnique = vi.fn();
  const visitorUpdate = vi.fn();
  const visitorUpdateMany = vi.fn();
  const visitorCount = vi.fn();
  const visitorFindMany = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();

  let service: VisitorsService;

  const future = new Date(Date.now() + 3_600_000).toISOString();

  const baseVisitor = {
    id: visitorId,
    societyId,
    buildingId,
    unitId,
    visitorName: 'Guest',
    visitorPhone: '+919876543210',
    purpose: 'Visit',
    expectedAt: new Date(future),
    vehicleNumber: null,
    notes: null,
    entryType: VisitorEntryType.EXPECTED,
    status: VisitorStatus.PENDING,
    createdByUserId: resident.id,
    decisionByUserId: null,
    decisionAt: null,
    checkedInAt: null,
    checkedOutAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    unit: { unitNumber: '101' },
    building: { code: 'A' },
  };

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    assertCanViewSociety.mockReset().mockResolvedValue({
      id: 'm1',
      societyId,
      userId: resident.id,
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: unitId,
    });
    ensureSocietyExists.mockReset().mockResolvedValue(undefined);
    for (const fn of [
      membershipFindFirst,
      unitFindFirst,
      visitorCreate,
      visitorFindUnique,
      visitorUpdate,
      visitorUpdateMany,
      visitorCount,
      visitorFindMany,
      auditCreate,
      transaction,
    ]) {
      fn.mockReset();
    }
    auditCreate.mockResolvedValue({});
    visitorUpdateMany.mockResolvedValue({ count: 0 });

    service = new VisitorsService(
      {
        societyMembership: { findFirst: membershipFindFirst },
        unit: { findFirst: unitFindFirst },
        visitor: {
          create: visitorCreate,
          findUnique: visitorFindUnique,
          update: visitorUpdate,
          updateMany: visitorUpdateMany,
          count: visitorCount,
          findMany: visitorFindMany,
        },
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

  it('creates expected visitors from the resident primary unit', async () => {
    membershipFindFirst.mockResolvedValue({
      id: 'm1',
      primaryUnitId: unitId,
      primaryUnit: {
        id: unitId,
        buildingId,
        status: UnitStatus.ACTIVE,
      },
    });
    visitorCreate.mockResolvedValue(baseVisitor);

    const result = await service.createExpected(resident, societyId, {
      visitorName: 'Guest',
      visitorPhone: '+91 98765 43210',
      purpose: 'Visit',
      expectedAt: future,
    });

    expect(visitorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          societyId,
          unitId,
          buildingId,
          entryType: VisitorEntryType.EXPECTED,
          status: VisitorStatus.PENDING,
          createdByUserId: resident.id,
        }),
      }),
    );
    expect(result.status).toBe(VisitorStatus.PENDING);
  });

  it('does not store an expected time that has no timezone offset', async () => {
    membershipFindFirst.mockResolvedValue({
      id: 'm1',
      primaryUnitId: unitId,
      primaryUnit: {
        id: unitId,
        buildingId,
        status: UnitStatus.ACTIVE,
      },
    });

    await expect(
      service.createExpected(resident, societyId, {
        visitorName: 'Guest',
        visitorPhone: '+919876543210',
        purpose: 'Visit',
        expectedAt: '2026-01-16T00:00:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(visitorCreate).not.toHaveBeenCalled();
  });

  it('rejects expected registration without a primary unit', async () => {
    membershipFindFirst.mockResolvedValue({
      id: 'm1',
      primaryUnitId: null,
      primaryUnit: null,
    });

    await expect(
      service.createExpected(resident, societyId, {
        visitorName: 'Guest',
        visitorPhone: '+919876543210',
        purpose: 'Visit',
        expectedAt: future,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates walk-ins as PENDING for a society unit', async () => {
    unitFindFirst.mockResolvedValue({
      id: unitId,
      buildingId,
      status: UnitStatus.ACTIVE,
    });
    visitorCreate.mockResolvedValue({
      ...baseVisitor,
      entryType: VisitorEntryType.WALK_IN,
      createdByUserId: admin.id,
    });

    const result = await service.createWalkIn(admin, societyId, {
      unitId,
      visitorName: 'Courier',
      visitorPhone: '+919811122233',
      purpose: 'Delivery',
    });

    expect(assertCanAdministerSociety).toHaveBeenCalled();
    expect(result.entryType).toBe(VisitorEntryType.WALK_IN);
    expect(result.status).toBe(VisitorStatus.PENDING);
  });

  it('prevents approving visitors for another unit', async () => {
    visitorFindUnique.mockResolvedValue(baseVisitor);
    membershipFindFirst.mockResolvedValue(null);

    await expect(service.approve(resident, visitorId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not let a platform owner approve a visitor without the unit membership', async () => {
    visitorFindUnique.mockResolvedValue(baseVisitor);
    membershipFindFirst.mockResolvedValue(null);

    await expect(
      service.approve(
        { ...admin, platformRole: PlatformRole.PLATFORM_OWNER },
        visitorId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ensureSocietyExists).not.toHaveBeenCalled();
  });

  it('enforces check-in and check-out transitions', async () => {
    visitorUpdateMany.mockResolvedValue({ count: 1 });
    visitorFindUnique
      .mockResolvedValueOnce({
        ...baseVisitor,
        status: VisitorStatus.APPROVED,
      })
      .mockResolvedValueOnce({
        ...baseVisitor,
        status: VisitorStatus.CHECKED_IN,
        checkedInAt: new Date(),
      });

    await service.checkIn(admin, visitorId);
    expect(visitorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: visitorId,
          status: VisitorStatus.APPROVED,
        }),
        data: expect.objectContaining({
          status: VisitorStatus.CHECKED_IN,
        }),
      }),
    );

    visitorFindUnique.mockResolvedValue({
      ...baseVisitor,
      status: VisitorStatus.PENDING,
    });
    await expect(service.checkIn(admin, visitorId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    visitorFindUnique.mockResolvedValue({
      ...baseVisitor,
      status: VisitorStatus.APPROVED,
    });
    await expect(service.checkOut(admin, visitorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('hides visitors from other units with not found', async () => {
    visitorFindUnique.mockResolvedValue({
      ...baseVisitor,
      unitId: otherUnitId,
    });
    membershipFindFirst.mockResolvedValue({
      role: MembershipRole.RESIDENT_USER,
      primaryUnitId: unitId,
    });

    await expect(service.getById(resident, visitorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
