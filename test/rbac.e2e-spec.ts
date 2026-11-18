import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  TOKEN_VERIFIER,
  type AuthenticatedUser,
  type TokenVerifier,
} from '../src/auth/auth.types.js';
import { UsersService } from '../src/auth/users.service.js';
import { AuthorizationService } from '../src/authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
} from '../src/generated/prisma/client.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';

describe('RBAC (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();
  const assertPlatformRoles =
    vi.fn<AuthorizationService['assertPlatformRoles']>();
  const assertSocietyRoles =
    vi.fn<AuthorizationService['assertSocietyRoles']>();

  const societyA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const societyB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    assertPlatformRoles.mockReset();
    assertSocietyRoles.mockReset();

    assertPlatformRoles.mockImplementation((user, roles) => {
      if (!user.platformRole || !roles.includes(user.platformRole)) {
        throw new ForbiddenException({
          message: 'You do not have permission to perform this action',
          code: 'FORBIDDEN',
        });
      }
    });

    assertSocietyRoles.mockImplementation(async (uid, societyId, roles) => {
      if (
        uid === userId &&
        societyId === societyA &&
        roles.includes(MembershipRole.SOCIETY_ADMIN)
      ) {
        return {
          id: 'membership-admin-a',
          societyId: societyA,
          userId: uid,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: null,
        };
      }
      if (
        uid === userId &&
        societyId === societyA &&
        roles.includes(MembershipRole.RESIDENT_USER)
      ) {
        return {
          id: 'membership-resident-a',
          societyId: societyA,
          userId: uid,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: null,
        };
      }
      throw new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({
        ensureProfile,
        getProfileWithMemberships,
      })
      .overrideProvider(AuthorizationService)
      .useValue({
        assertAuthenticated: (user?: AuthenticatedUser) => {
          if (!user) {
            throw new UnauthorizedException({
              message: 'Authentication is required',
              code: 'UNAUTHORIZED',
            });
          }
          return user;
        },
        assertPlatformRoles,
        assertSocietyRoles,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, { swagger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function mockAuth(user: AuthenticatedUser) {
    verify.mockResolvedValue({
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    ensureProfile.mockResolvedValue(user);
  }

  it('keeps public health accessible without authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('returns 401 for protected RBAC probes without a bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/platform-owners')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 401 for an invalid bearer token on RBAC probes', async () => {
    verify.mockRejectedValue(
      new UnauthorizedException({
        message: 'Invalid or expired access token',
        code: 'UNAUTHORIZED',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/platform-owners')
      .set('Authorization', 'Bearer bad-token')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('allows a platform owner on the platform probe', async () => {
    mockAuth({
      id: userId,
      email: 'owner@example.com',
      displayName: 'Owner',
      platformRole: PlatformRole.PLATFORM_OWNER,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/platform-owners')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        allowed: true,
        scope: 'platform',
        platformRole: PlatformRole.PLATFORM_OWNER,
      },
    });
  });

  it('denies a non-owner on the platform probe with 403', async () => {
    mockAuth({
      id: userId,
      email: 'resident@example.com',
      displayName: 'Resident',
      platformRole: null,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/platform-owners')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('allows a society admin for society A admin probe', async () => {
    mockAuth({
      id: userId,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rbac/societies/${societyA}/admins`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        allowed: true,
        scope: 'society_admin',
        societyId: societyA,
        membershipRole: MembershipRole.SOCIETY_ADMIN,
      },
    });
  });

  it('denies a society A admin accessing society B', async () => {
    mockAuth({
      id: userId,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/rbac/societies/${societyB}/admins`)
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(assertSocietyRoles).toHaveBeenCalledWith(userId, societyB, [
      MembershipRole.SOCIETY_ADMIN,
    ]);
  });

  it('denies a resident on society-admin-only operations but allows member probe', async () => {
    mockAuth({
      id: userId,
      email: 'resident@example.com',
      displayName: 'Resident',
      platformRole: null,
    });

    assertSocietyRoles.mockImplementation(async (_uid, societyId, roles) => {
      if (
        societyId === societyA &&
        roles.length === 1 &&
        roles[0] === MembershipRole.SOCIETY_ADMIN
      ) {
        throw new ForbiddenException({
          message: 'You do not have permission to access this society',
          code: 'FORBIDDEN',
        });
      }
      if (
        societyId === societyA &&
        roles.includes(MembershipRole.RESIDENT_USER)
      ) {
        return {
          id: 'membership-resident-a',
          societyId: societyA,
          userId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: null,
        };
      }
      throw new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      });
    });

    await request(app.getHttpServer())
      .get(`/api/v1/rbac/societies/${societyA}/admins`)
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    const memberResponse = await request(app.getHttpServer())
      .get(`/api/v1/rbac/societies/${societyA}/members`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(memberResponse.body).toMatchObject({
      data: {
        allowed: true,
        scope: 'society_member',
        membershipRole: MembershipRole.RESIDENT_USER,
      },
    });
  });
});
