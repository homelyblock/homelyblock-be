import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
} from '../generated/prisma/client.js';
import {
  REQUIRE_PLATFORM_ROLES_KEY,
  REQUIRE_SOCIETY_ROLES_KEY,
} from './authorization.constants.js';
import { AuthorizationGuard } from './authorization.guard.js';
import { AuthorizationService } from './authorization.service.js';

describe('AuthorizationGuard', () => {
  const getAllAndOverride = vi.fn();
  const assertPlatformRoles = vi.fn();
  const assertSocietyRoles = vi.fn();
  let guard: AuthorizationGuard;

  const user: AuthenticatedUser = {
    id: '11111111-1111-1111-1111-111111111111',
    displayName: 'User',
    platformRole: PlatformRole.PLATFORM_OWNER,
  };

  beforeEach(() => {
    getAllAndOverride.mockReset();
    assertPlatformRoles.mockReset();
    assertSocietyRoles.mockReset();
    guard = new AuthorizationGuard(
      { getAllAndOverride } as unknown as Reflector,
      {
        assertPlatformRoles,
        assertSocietyRoles,
      } as unknown as AuthorizationService,
    );
  });

  function createContext(options: {
    user?: AuthenticatedUser;
    params?: Record<string, string>;
  }): {
    context: ExecutionContext;
    request: {
      user?: AuthenticatedUser;
      params?: Record<string, string>;
      societyMembership?: unknown;
    };
  } {
    const request = {
      user: options.user,
      params: options.params,
    };
    return {
      request,
      context: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext,
    };
  }

  it('allows requests when no role metadata is present', async () => {
    getAllAndOverride.mockReturnValue(undefined);
    const { context } = createContext({ user });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(assertPlatformRoles).not.toHaveBeenCalled();
    expect(assertSocietyRoles).not.toHaveBeenCalled();
  });

  it('returns 401 when role metadata exists but the user is missing', async () => {
    getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_PLATFORM_ROLES_KEY) {
        return { roles: [PlatformRole.PLATFORM_OWNER] };
      }
      return undefined;
    });
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enforces platform roles for platform-scoped routes', async () => {
    getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_PLATFORM_ROLES_KEY) {
        return { roles: [PlatformRole.PLATFORM_OWNER] };
      }
      return undefined;
    });
    const { context } = createContext({ user });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(assertPlatformRoles).toHaveBeenCalledWith(user, [
      PlatformRole.PLATFORM_OWNER,
    ]);
  });

  it('enforces society roles for the society id in the route', async () => {
    getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_SOCIETY_ROLES_KEY) {
        return {
          roles: [MembershipRole.SOCIETY_ADMIN],
          societyIdParam: 'societyId',
        };
      }
      return undefined;
    });
    assertSocietyRoles.mockResolvedValue({
      id: 'membership-1',
      societyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: user.id,
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
    });

    const { context, request } = createContext({
      user: { ...user, platformRole: null },
      params: { societyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(assertSocietyRoles).toHaveBeenCalledWith(
      user.id,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      [MembershipRole.SOCIETY_ADMIN],
    );
    expect(request.societyMembership).toMatchObject({
      role: MembershipRole.SOCIETY_ADMIN,
    });
  });

  it('rejects society-scoped routes without a society id param', async () => {
    getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_SOCIETY_ROLES_KEY) {
        return {
          roles: [MembershipRole.SOCIETY_ADMIN],
          societyIdParam: 'societyId',
        };
      }
      return undefined;
    });
    const { context } = createContext({
      user: { ...user, platformRole: null },
      params: {},
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
