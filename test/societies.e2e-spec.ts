import {
  INestApplication,
  NotFoundException,
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
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  SocietyStatus,
} from '../src/generated/prisma/client.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { SocietiesService } from '../src/societies/societies.service.js';

describe('Societies (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();
  const create = vi.fn<SocietiesService['create']>();
  const list = vi.fn<SocietiesService['list']>();
  const getById = vi.fn<SocietiesService['getById']>();

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const adminId = '22222222-2222-4222-8222-222222222222';
  const residentId = '33333333-3333-4333-8333-333333333333';
  const societyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const societyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    create.mockReset();
    list.mockReset();
    getById.mockReset();

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
      .overrideProvider(SocietiesService)
      .useValue({
        create,
        list,
        getById,
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

  it('allows PLATFORM_OWNER to create a society', async () => {
    mockAuth({
      id: ownerId,
      email: 'owner@example.com',
      displayName: 'Owner',
      platformRole: PlatformRole.PLATFORM_OWNER,
    });
    create.mockResolvedValue({
      society: {
        id: societyA,
        name: 'Society A',
        addressLine1: null,
        addressLine2: null,
        city: 'Pune',
        state: 'MH',
        postalCode: null,
        status: SocietyStatus.ACTIVE,
        membershipRole: null,
        createdAt: '2026-10-29T12:00:00.000Z',
        updatedAt: '2026-10-29T12:00:00.000Z',
      },
      initialAdminMembership: {
        id: 'membership-1',
        societyId: societyA,
        userId: adminId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/societies')
      .set('Authorization', 'Bearer owner-token')
      .send({
        name: 'Society A',
        city: 'Pune',
        state: 'MH',
        initialAdminUserId: adminId,
      })
      .expect(201);

    expect(create).toHaveBeenCalled();
    expect(response.body.data.society.id).toBe(societyA);
  });

  it('denies society creation to SOCIETY_ADMIN and RESIDENT_USER', async () => {
    mockAuth({
      id: adminId,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: null,
    });

    await request(app.getHttpServer())
      .post('/api/v1/societies')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Society A',
        initialAdminUserId: adminId,
      })
      .expect(403);

    expect(create).not.toHaveBeenCalled();

    mockAuth({
      id: residentId,
      email: 'resident@example.com',
      displayName: 'Resident',
      platformRole: null,
    });

    await request(app.getHttpServer())
      .post('/api/v1/societies')
      .set('Authorization', 'Bearer resident-token')
      .send({
        name: 'Society A',
        initialAdminUserId: adminId,
      })
      .expect(403);
  });

  it('returns 401 when creating without authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/societies')
      .send({
        name: 'Society A',
        initialAdminUserId: adminId,
      })
      .expect(401);
  });

  it('rejects invalid create payloads', async () => {
    mockAuth({
      id: ownerId,
      email: 'owner@example.com',
      displayName: 'Owner',
      platformRole: PlatformRole.PLATFORM_OWNER,
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/societies')
      .set('Authorization', 'Bearer owner-token')
      .send({
        name: 'A',
        initialAdminUserId: 'not-a-uuid',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('restricts admin listing to assigned societies via service scope', async () => {
    mockAuth({
      id: adminId,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: null,
    });
    list.mockResolvedValue({
      items: [
        {
          id: societyA,
          name: 'Society A',
          city: 'Pune',
          state: 'MH',
          status: SocietyStatus.ACTIVE,
          membershipRole: MembershipRole.SOCIETY_ADMIN,
          createdAt: '2026-10-29T12:00:00.000Z',
          updatedAt: '2026-10-29T12:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/societies?page=1&limit=20')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ id: adminId }),
      1,
      20,
    );
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].id).toBe(societyA);
  });

  it('denies cross-society detail access', async () => {
    mockAuth({
      id: adminId,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformRole: null,
    });
    getById.mockRejectedValue(
      new NotFoundException({
        message: 'Society not found',
        code: 'NOT_FOUND',
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyB}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(404);
  });

  it('keeps public health available while societies stay protected', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    verify.mockRejectedValue(
      new UnauthorizedException({
        message: 'Invalid or expired access token',
        code: 'UNAUTHORIZED',
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/societies')
      .set('Authorization', 'Bearer bad')
      .expect(401);
  });

  it('returns empty paginated results', async () => {
    mockAuth({
      id: residentId,
      email: 'resident@example.com',
      displayName: 'Resident',
      platformRole: null,
    });
    list.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/societies')
      .set('Authorization', 'Bearer resident-token')
      .expect(200);

    expect(response.body.data).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
  });
});
