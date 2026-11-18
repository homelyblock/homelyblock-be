import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  TOKEN_VERIFIER,
  type AuthenticatedUser,
  type TokenVerifier,
  type VerifiedAccessToken,
} from '../src/auth/auth.types.js';
import { UsersService } from '../src/auth/users.service.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();
  const completeOnboarding = vi.fn<UsersService['completeOnboarding']>();

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    completeOnboarding.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({
        ensureProfile,
        getProfileWithMemberships,
        completeOnboarding,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, { swagger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 when the authorization header is missing', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns 401 for a malformed bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Token not-a-bearer')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authorization header must use Bearer token format',
    });
  });

  it('returns 401 for an invalid or expired token', async () => {
    verify.mockRejectedValue(
      new UnauthorizedException({
        message: 'Invalid or expired access token',
        code: 'UNAUTHORIZED',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer expired-or-bad')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired access token',
    });
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it('returns the current user for a valid token', async () => {
    const identity: VerifiedAccessToken = {
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'resident@example.com',
      displayName: 'Resident One',
    };
    const user: AuthenticatedUser = {
      id: identity.sub,
      email: identity.email,
      displayName: 'Resident One',
      platformRole: null,
    };
    const now = new Date('2026-10-29T12:00:00.000Z');

    verify.mockResolvedValue(identity);
    ensureProfile.mockResolvedValue(user);
    getProfileWithMemberships.mockResolvedValue({
      id: user.id,
      displayName: user.displayName,
      phone: null,
      platformRole: null,
      accountType: null,
      createdAt: now,
      updatedAt: now,
      memberships: [],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer valid-access-token')
      .expect(200);

    expect(verify).toHaveBeenCalledWith('valid-access-token');
    expect(ensureProfile).toHaveBeenCalledWith(identity);
    expect(response.body).toEqual({
      data: {
        id: user.id,
        email: 'resident@example.com',
        displayName: 'Resident One',
        phone: null,
        platformRole: null,
        accountType: null,
        memberships: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  });

  it('rejects onboarding without a token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/me/onboarding')
      .send({ accountType: 'RESIDENT_USER' })
      .expect(401);

    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('ignores a forged onboarding body and still rejects profile privilege fields', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    verify.mockResolvedValue({
      sub: userId,
      email: 'resident@example.com',
      displayName: 'Resident One',
    });
    ensureProfile.mockResolvedValue({
      id: userId,
      email: 'resident@example.com',
      displayName: 'Resident One',
      platformRole: null,
    });
    completeOnboarding.mockResolvedValue({
      id: userId,
      displayName: 'Resident One',
      email: 'resident@example.com',
      phone: null,
      platformRole: null,
      accountType: 'RESIDENT_USER',
      createdAt: new Date('2026-11-18T00:00:00.000Z'),
      updatedAt: new Date('2026-11-18T00:00:00.000Z'),
      memberships: [],
    });

    await request(app.getHttpServer())
      .post('/api/v1/me/onboarding')
      .set('Authorization', 'Bearer valid-access-token')
      .send({
        accountType: 'SOCIETY_ADMIN',
        societyName: 'Palm Court',
        city: 'Pune',
        platformRole: 'PLATFORM_OWNER',
        userId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(201);

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(completeOnboarding).toHaveBeenCalledWith(userId);

    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-access-token')
      .send({ accountType: 'SOCIETY_ADMIN', platformRole: 'PLATFORM_OWNER' })
      .expect(400);
  });

  it('onboards the authenticated user from the stored signup intent', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const now = new Date('2026-11-18T00:00:00.000Z');
    verify.mockResolvedValue({
      sub: userId,
      email: 'resident@example.com',
      displayName: 'Resident One',
    });
    ensureProfile.mockResolvedValue({
      id: userId,
      email: 'resident@example.com',
      displayName: 'Resident One',
      platformRole: null,
    });
    completeOnboarding.mockResolvedValue({
      id: userId,
      displayName: 'Resident One',
      email: 'resident@example.com',
      phone: null,
      platformRole: null,
      accountType: 'RESIDENT_USER',
      createdAt: now,
      updatedAt: now,
      memberships: [],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/onboarding')
      .set('Authorization', 'Bearer valid-access-token')
      .send({})
      .expect(201);

    expect(completeOnboarding).toHaveBeenCalledWith(userId);
    expect(response.body.data.accountType).toBe('RESIDENT_USER');
    expect(response.body.data.platformRole).toBeNull();
    expect(response.body.data.id).toBe(userId);
  });
});
