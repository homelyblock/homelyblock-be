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
import { ServiceDirectoryService } from '../src/service-directory/service-directory.service.js';

describe('Service directory (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();

  const list = vi.fn();
  const create = vi.fn();
  const get = vi.fn();
  const update = vi.fn();
  const deactivate = vi.fn();
  const activate = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const serviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const adminId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    for (const fn of [list, create, get, update, deactivate, activate]) {
      fn.mockReset();
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({ ensureProfile, getProfileWithMemberships })
      .overrideProvider(ServiceDirectoryService)
      .useValue({ list, create, get, update, deactivate, activate })
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

  it('exposes society services routes under /api/v1', async () => {
    const admin: AuthenticatedUser = {
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    };
    mockAuth(admin);
    list.mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 });
    create.mockResolvedValue({ id: serviceId, name: 'Provider' });
    get.mockResolvedValue({ id: serviceId, name: 'Provider' });
    deactivate.mockResolvedValue({ id: serviceId, isActive: false });
    activate.mockResolvedValue({ id: serviceId, isActive: true });

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/services`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/services`)
      .set('Authorization', 'Bearer token')
      .send({
        name: 'Shinde Plumbing',
        category: 'PLUMBING',
        phone: '+919876543210',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/services/${serviceId}`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/services/${serviceId}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/services/${serviceId}/activate`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(list).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    expect(deactivate).toHaveBeenCalled();
    expect(activate).toHaveBeenCalled();
  });
});
