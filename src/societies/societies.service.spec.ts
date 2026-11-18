import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  SocietyStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SocietiesService } from './societies.service.js';

describe('SocietiesService', () => {
  const findUniqueProfile = vi.fn();
  const transaction = vi.fn();
  const societyCount = vi.fn();
  const societyFindMany = vi.fn();
  const societyFindUnique = vi.fn();
  const membershipFindFirst = vi.fn();

  let service: SocietiesService;

  const owner: AuthenticatedUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'owner@example.com',
    displayName: 'Owner',
    platformRole: PlatformRole.PLATFORM_OWNER,
  };

  const resident: AuthenticatedUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'resident@example.com',
    displayName: 'Resident',
    platformRole: null,
  };

  const societyA = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Society A',
    addressLine1: '1 Main',
    addressLine2: null,
    city: 'Pune',
    state: 'MH',
    postalCode: '411001',
    status: SocietyStatus.ACTIVE,
    createdAt: new Date('2026-10-29T12:00:00.000Z'),
    updatedAt: new Date('2026-10-29T12:00:00.000Z'),
  };

  beforeEach(() => {
    findUniqueProfile.mockReset();
    transaction.mockReset();
    societyCount.mockReset();
    societyFindMany.mockReset();
    societyFindUnique.mockReset();
    membershipFindFirst.mockReset();

    service = new SocietiesService({
      userProfile: { findUnique: findUniqueProfile },
      $transaction: transaction,
      society: {
        count: societyCount,
        findMany: societyFindMany,
        findUnique: societyFindUnique,
      },
      societyMembership: { findFirst: membershipFindFirst },
    } as unknown as PrismaService);
  });

  it('creates a society and initial admin membership in one transaction', async () => {
    findUniqueProfile.mockResolvedValue({
      id: resident.id,
      displayName: 'Resident',
    });
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        society: {
          create: vi.fn().mockResolvedValue(societyA),
        },
        societyMembership: {
          create: vi.fn().mockResolvedValue({
            id: 'membership-1',
            societyId: societyA.id,
            userId: resident.id,
            role: MembershipRole.SOCIETY_ADMIN,
            status: MembershipStatus.ACTIVE,
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };
      return fn(tx);
    });

    const result = await service.create(owner, {
      name: 'Society A',
      initialAdminUserId: resident.id,
    });

    expect(result.society.id).toBe(societyA.id);
    expect(result.initialAdminMembership.role).toBe(
      MembershipRole.SOCIETY_ADMIN,
    );
  });

  it('rejects create when the initial admin user does not exist', async () => {
    findUniqueProfile.mockResolvedValue(null);

    await expect(
      service.create(owner, {
        name: 'Society A',
        initialAdminUserId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rolls back when membership creation fails inside the transaction', async () => {
    findUniqueProfile.mockResolvedValue({
      id: resident.id,
      displayName: 'Resident',
    });
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        society: {
          create: vi.fn().mockResolvedValue(societyA),
        },
        societyMembership: {
          create: vi.fn().mockRejectedValue(new Error('membership failed')),
        },
        auditLog: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    await expect(
      service.create(owner, {
        name: 'Society A',
        initialAdminUserId: resident.id,
      }),
    ).rejects.toThrow(/membership failed/);
  });

  it('lists all societies for a platform owner with pagination metadata', async () => {
    societyCount.mockResolvedValue(0);
    societyFindMany.mockResolvedValue([]);
    transaction.mockResolvedValue([0, 0, 0, []]);

    await expect(service.list(owner, 1, 20)).resolves.toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      activeCount: 0,
      archivedCount: 0,
    });
  });

  it('returns empty results for a member with no societies', async () => {
    transaction.mockResolvedValue([0, 0, 0, []]);

    await expect(service.list(resident, 1, 20)).resolves.toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      activeCount: 0,
      archivedCount: 0,
    });
  });

  it('returns resident-scoped detail fields for an active resident', async () => {
    societyFindUnique.mockResolvedValue(societyA);
    membershipFindFirst.mockResolvedValue({
      role: MembershipRole.RESIDENT_USER,
    });

    const detail = await service.getById(resident, societyA.id);
    expect(detail).toEqual({
      id: societyA.id,
      name: societyA.name,
      city: societyA.city,
      state: societyA.state,
      status: societyA.status,
      membershipRole: MembershipRole.RESIDENT_USER,
      createdAt: societyA.createdAt.toISOString(),
      updatedAt: societyA.updatedAt.toISOString(),
    });
    expect(detail).not.toHaveProperty('addressLine1');
  });

  it('hides societies the caller cannot access', async () => {
    societyFindUnique.mockResolvedValue(societyA);
    membershipFindFirst.mockResolvedValue(null);

    await expect(service.getById(resident, societyA.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
