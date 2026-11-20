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
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipsService } from './memberships.service.js';

describe('MembershipsService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const otherSocietyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const membershipId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const userId = '22222222-2222-4222-8222-222222222222';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'admin@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const assertKeepsActiveSocietyAdmin = vi.fn();
  const profileFindUnique = vi.fn();
  const membershipFindMany = vi.fn();
  const membershipCount = vi.fn();
  const membershipFindFirst = vi.fn();
  const membershipFindUnique = vi.fn();
  const membershipCreate = vi.fn();
  const membershipUpdate = vi.fn();
  const membershipUpdateMany = vi.fn();
  const unitFindFirst = vi.fn();
  const auditCreate = vi.fn();

  let service: MembershipsService;

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    assertKeepsActiveSocietyAdmin.mockReset().mockResolvedValue(undefined);
    profileFindUnique.mockReset();
    membershipFindMany.mockReset();
    membershipCount.mockReset().mockResolvedValue(1);
    membershipFindFirst.mockReset();
    membershipFindUnique.mockReset();
    membershipCreate.mockReset();
    membershipUpdate.mockReset();
    membershipUpdateMany.mockReset();
    unitFindFirst.mockReset();
    auditCreate.mockReset().mockResolvedValue({});

    service = new MembershipsService(
      {
        userProfile: { findUnique: profileFindUnique },
        societyMembership: {
          findMany: membershipFindMany,
          count: membershipCount,
          findFirst: membershipFindFirst,
          findUnique: membershipFindUnique,
          create: membershipCreate,
          update: membershipUpdate,
        },
        unit: { findFirst: unitFindFirst },
        auditLog: { create: auditCreate },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            societyMembership: {
              update: membershipUpdate,
              updateMany: membershipUpdateMany,
              findUnique: membershipFindUnique,
              findUniqueOrThrow: membershipFindUnique,
            },
            auditLog: { create: auditCreate },
          }),
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
        assertKeepsActiveSocietyAdmin,
      } as unknown as AuthorizationService,
    );
  });

  it('lists members only for callers who can administer the society', async () => {
    membershipFindMany.mockResolvedValue([
      {
        id: membershipId,
        societyId,
        userId,
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.ACTIVE,
        primaryUnitId: unitId,
        createdAt: new Date('2026-10-29T12:00:00.000Z'),
        updatedAt: new Date('2026-10-29T12:00:00.000Z'),
        user: { displayName: 'Resident', email: 'r@example.com' },
      },
    ]);

    const result = await service.list(admin, societyId);

    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(result.invitationTtlDays).toBeGreaterThan(0);
    expect(result.items[0]).toMatchObject({
      displayName: 'Resident',
      email: 'r@example.com',
      role: MembershipRole.RESIDENT_USER,
      primaryUnitId: unitId,
    });
  });

  it('filters the member page by role and status inside the society', async () => {
    membershipFindMany.mockResolvedValue([]);

    await service.list(admin, societyId, {
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      limit: 100,
    });

    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          societyId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        }),
      }),
    );
  });

  it('does not query members when the caller cannot administer the society', async () => {
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(service.list(admin, societyId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(membershipFindMany).not.toHaveBeenCalled();
  });

  it('rejects a create that would grant access immediately', async () => {
    await expect(
      service.create(admin, societyId, {
        userId,
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it('rejects create when the user profile does not exist', async () => {
    profileFindUnique.mockResolvedValue(null);

    await expect(
      service.create(admin, societyId, {
        userId,
        role: MembershipRole.RESIDENT_USER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects primary units that belong to another society', async () => {
    profileFindUnique.mockResolvedValue({
      id: userId,
      displayName: 'Resident',
      email: 'r@example.com',
    });
    unitFindFirst.mockResolvedValue(null);

    await expect(
      service.create(admin, societyId, {
        userId,
        role: MembershipRole.RESIDENT_USER,
        primaryUnitId: unitId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(unitFindFirst).toHaveBeenCalledWith({
      where: { id: unitId, societyId },
      select: { id: true },
    });
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it('maps duplicate memberships to conflict', async () => {
    profileFindUnique.mockResolvedValue({
      id: userId,
      displayName: 'Resident',
      email: 'r@example.com',
    });
    membershipCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(admin, societyId, {
        userId,
        role: MembershipRole.RESIDENT_USER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('authorizes updates against the membership society, not a client society id', async () => {
    membershipFindUnique.mockResolvedValue({
      id: membershipId,
      societyId,
    });
    membershipUpdate.mockResolvedValue({
      id: membershipId,
      societyId,
      userId,
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
      createdAt: new Date('2026-10-29T12:00:00.000Z'),
      updatedAt: new Date('2026-10-29T12:00:00.000Z'),
      user: { displayName: 'Resident', email: 'r@example.com' },
    });

    await service.update(admin, membershipId, {
      status: MembershipStatus.ACTIVE,
    });

    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(assertCanAdministerSociety).not.toHaveBeenCalledWith(
      admin,
      otherSocietyId,
    );
    expect(assertKeepsActiveSocietyAdmin).toHaveBeenCalledWith(
      expect.any(Object),
      societyId,
      membershipId,
      { role: undefined, status: MembershipStatus.ACTIVE },
    );
  });

  it('refuses to activate an expired invitation', async () => {
    membershipFindUnique.mockResolvedValue({
      id: membershipId,
      societyId,
      userId,
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.INVITED,
      primaryUnitId: null,
      invitedAt: new Date('2020-01-01T00:00:00.000Z'),
      invitationExpiresAt: new Date('2020-01-15T00:00:00.000Z'),
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      user: { displayName: 'Resident', email: 'r@example.com' },
    });
    membershipUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(admin, membershipId, { status: MembershipStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(admin, membershipId, { status: MembershipStatus.ACTIVE }),
    ).rejects.toSatisfy((error: ConflictException) => {
      expect(error.getResponse()).toMatchObject({ code: 'INVITATION_EXPIRED' });
      return true;
    });
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it('returns not found for missing memberships', async () => {
    membershipFindUnique.mockResolvedValue(null);

    await expect(
      service.update(admin, membershipId, {
        status: MembershipStatus.REMOVED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates forbidden when caller cannot administer the society', async () => {
    membershipFindUnique.mockResolvedValue({
      id: membershipId,
      societyId,
    });
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(
      service.update(admin, membershipId, {
        status: MembershipStatus.SUSPENDED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertKeepsActiveSocietyAdmin).not.toHaveBeenCalled();
  });

  it('does not update when the last active admin would be removed', async () => {
    membershipFindUnique.mockResolvedValue({
      id: membershipId,
      societyId,
    });
    assertKeepsActiveSocietyAdmin.mockRejectedValue(
      new ConflictException({
        message:
          'This society must keep at least one active society administrator.',
        code: 'CONFLICT',
      }),
    );

    await expect(
      service.update(
        { ...admin, platformRole: PlatformRole.PLATFORM_OWNER },
        membershipId,
        { role: MembershipRole.RESIDENT_USER },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(membershipUpdate).not.toHaveBeenCalled();
  });
});
