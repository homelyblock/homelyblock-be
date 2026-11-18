import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
} from '../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from './authorization.service.js';

describe('AuthorizationService', () => {
  const findFirst = vi.fn();
  const societyFindUnique = vi.fn();
  let service: AuthorizationService;

  const user: AuthenticatedUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'user@example.com',
    displayName: 'User',
    platformRole: null,
  };

  beforeEach(() => {
    findFirst.mockReset();
    societyFindUnique.mockReset();
    service = new AuthorizationService({
      societyMembership: { findFirst },
      society: { findUnique: societyFindUnique },
    } as unknown as PrismaService);
  });

  it('rejects a missing authenticated user', () => {
    expect(() => service.assertAuthenticated(undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('allows a platform owner for platform-scoped actions', () => {
    expect(() =>
      service.assertPlatformRoles(
        { ...user, platformRole: PlatformRole.PLATFORM_OWNER },
        [PlatformRole.PLATFORM_OWNER],
      ),
    ).not.toThrow();
  });

  it('denies a non-owner for platform-scoped actions', () => {
    expect(() =>
      service.assertPlatformRoles(user, [PlatformRole.PLATFORM_OWNER]),
    ).toThrow(ForbiddenException);
  });

  it('allows an active society admin for admin-only society actions', async () => {
    findFirst.mockResolvedValue({
      id: 'membership-1',
      societyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: user.id,
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
    });

    await expect(
      service.assertSocietyRoles(
        user.id,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        [MembershipRole.SOCIETY_ADMIN],
      ),
    ).resolves.toMatchObject({
      role: MembershipRole.SOCIETY_ADMIN,
    });
  });

  it('denies a resident for society-admin-only actions', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.assertSocietyRoles(
        user.id,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        [MembershipRole.SOCIETY_ADMIN],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a society A admin when checking society B', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.assertSocietyRoles(
        user.id,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        [MembershipRole.SOCIETY_ADMIN],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          societyId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          status: MembershipStatus.ACTIVE,
        }),
      }),
    );
  });

  it('lets platform owners administer any existing society', async () => {
    societyFindUnique.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    await expect(
      service.assertCanAdministerSociety(
        { ...user, platformRole: PlatformRole.PLATFORM_OWNER },
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('lets platform owners search the whole platform', async () => {
    await expect(
      service.resolveUserSearchScope(
        { ...user, platformRole: PlatformRole.PLATFORM_OWNER },
        undefined,
      ),
    ).resolves.toEqual({ type: 'platform' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('requires a real society when a platform owner passes societyId', async () => {
    societyFindUnique.mockResolvedValue(null);

    await expect(
      service.resolveUserSearchScope(
        { ...user, platformRole: PlatformRole.PLATFORM_OWNER },
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes society admin search to the society they administer', async () => {
    findFirst.mockResolvedValue({
      id: 'membership-1',
      societyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: user.id,
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
    });

    await expect(
      service.resolveUserSearchScope(
        user,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toEqual({
      type: 'society',
      societyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
  });

  it('requires societyId for society admins', async () => {
    findFirst.mockResolvedValue({ id: 'membership-1' });

    await expect(
      service.resolveUserSearchScope(user, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies residents who omit societyId', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.resolveUserSearchScope(user, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a society admin from searching in another society', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.resolveUserSearchScope(
        user,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies residents from searching users', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.resolveUserSearchScope(
        user,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('assertKeepsActiveSocietyAdmin', () => {
    const societyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const membershipId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const executeRaw = vi.fn();
    const membershipFindUnique = vi.fn();
    const membershipCount = vi.fn();
    const tx = {
      $executeRaw: executeRaw,
      societyMembership: {
        findUnique: membershipFindUnique,
        count: membershipCount,
      },
    };

    beforeEach(() => {
      executeRaw.mockReset().mockResolvedValue(1);
      membershipFindUnique.mockReset();
      membershipCount.mockReset();
    });

    it('locks the society and rejects removal of the only active admin', async () => {
      membershipFindUnique.mockResolvedValue({
        id: membershipId,
        societyId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.ACTIVE,
      });
      membershipCount.mockResolvedValue(0);

      await expect(
        service.assertKeepsActiveSocietyAdmin(
          tx as never,
          societyId,
          membershipId,
          { status: MembershipStatus.SUSPENDED },
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(executeRaw).toHaveBeenCalled();
      expect(membershipCount).toHaveBeenCalledWith({
        where: {
          societyId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
          id: { not: membershipId },
        },
      });
    });

    it('allows demotion when another active admin remains', async () => {
      membershipFindUnique.mockResolvedValue({
        id: membershipId,
        societyId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.ACTIVE,
      });
      membershipCount.mockResolvedValue(1);

      await expect(
        service.assertKeepsActiveSocietyAdmin(
          tx as never,
          societyId,
          membershipId,
          { role: MembershipRole.RESIDENT_USER },
        ),
      ).resolves.toBeUndefined();
    });

    it('does not count invited, suspended, or removed admins, or resident changes', async () => {
      membershipFindUnique.mockResolvedValue({
        id: membershipId,
        societyId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.INVITED,
      });

      await expect(
        service.assertKeepsActiveSocietyAdmin(
          tx as never,
          societyId,
          membershipId,
          { status: MembershipStatus.REMOVED },
        ),
      ).resolves.toBeUndefined();

      membershipFindUnique.mockResolvedValue({
        id: membershipId,
        societyId,
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.ACTIVE,
      });
      await expect(
        service.assertKeepsActiveSocietyAdmin(
          tx as never,
          societyId,
          membershipId,
          { status: MembershipStatus.SUSPENDED },
        ),
      ).resolves.toBeUndefined();
      expect(membershipCount).not.toHaveBeenCalled();
    });

    it('allows a flat change for the only active admin', async () => {
      membershipFindUnique.mockResolvedValue({
        id: membershipId,
        societyId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.assertKeepsActiveSocietyAdmin(
          tx as never,
          societyId,
          membershipId,
          {},
        ),
      ).resolves.toBeUndefined();
      expect(membershipCount).not.toHaveBeenCalled();
    });

    it('reads the membership after the lock', async () => {
      membershipFindUnique.mockResolvedValue({
        id: membershipId,
        societyId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.SUSPENDED,
      });

      await service.assertKeepsActiveSocietyAdmin(
        tx as never,
        societyId,
        membershipId,
        { role: MembershipRole.RESIDENT_USER },
      );

      expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        membershipFindUnique.mock.invocationCallOrder[0],
      );
      expect(membershipCount).not.toHaveBeenCalled();
    });
  });
});
