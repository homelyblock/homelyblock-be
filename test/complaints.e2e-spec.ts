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
import { ComplaintsService } from '../src/complaints/complaints.service.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';

describe('Complaints (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();

  const create = vi.fn();
  const list = vi.fn();
  const getDashboard = vi.fn();
  const get = vi.fn();
  const acknowledge = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const adminId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    for (const fn of [create, list, getDashboard, get, acknowledge]) {
      fn.mockReset();
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({ ensureProfile, getProfileWithMemberships })
      .overrideProvider(ComplaintsService)
      .useValue({
        create,
        list,
        getDashboard,
        get,
        acknowledge,
        assign: vi.fn(),
        start: vi.fn(),
        resolve: vi.fn(),
        close: vi.fn(),
        reopen: vi.fn(),
        addComment: vi.fn(),
        listComments: vi.fn(),
        addAttachment: vi.fn(),
        downloadAttachment: vi.fn(),
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
      email: user.email ?? undefined,
    });
    ensureProfile.mockResolvedValue(user);
    getProfileWithMemberships.mockResolvedValue({
      ...user,
      memberships: [],
    });
  }

  it('creates and lists complaints through /api/v1', async () => {
    const admin: AuthenticatedUser = {
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    };
    mockAuth(admin);
    create.mockResolvedValue({ id: 'c1', title: 'Leak' });
    list.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    getDashboard.mockResolvedValue({
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      highOrUrgent: 0,
      byCategory: [],
      recent: [],
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/complaints`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Kitchen leak',
        description: 'Water under sink',
        category: 'PLUMBING',
        priority: 'HIGH',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/complaints`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/complaints/dashboard`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(create).toHaveBeenCalled();
    expect(list).toHaveBeenCalled();
    expect(getDashboard).toHaveBeenCalled();
  });
});
