import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  TOKEN_VERIFIER,
  type AuthenticatedUser,
  type TokenVerifier,
} from '../src/auth/auth.types.js';
import { UsersService } from '../src/auth/users.service.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { DashboardService } from '../src/dashboard/dashboard.service.js';

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();
  const getResidentDashboard = vi.fn();
  const getAdminDashboard = vi.fn();
  const getActivity = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    getResidentDashboard.mockReset();
    getAdminDashboard.mockReset();
    getActivity.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({ ensureProfile, getProfileWithMemberships })
      .overrideProvider(DashboardService)
      .useValue({
        getResidentDashboard,
        getAdminDashboard,
        getActivity,
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

  it('wires resident, admin, and activity dashboard routes', async () => {
    mockAuth({
      id: userId,
      displayName: 'User',
      email: 'u@example.com',
      platformRole: null,
    });
    getResidentDashboard.mockResolvedValue({ role: 'RESIDENT' });
    getAdminDashboard.mockResolvedValue({ role: 'ADMIN' });
    getActivity.mockResolvedValue({ role: 'ADMIN', items: [] });

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/dashboard/resident`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `/api/v1/societies/${societyId}/dashboard/admin?periodYear=2026&periodMonth=10`,
      )
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/dashboard/activity?limit=10`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(getAdminDashboard).toHaveBeenCalled();
  });
});
