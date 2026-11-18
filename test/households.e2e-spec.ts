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
import { HouseholdsService } from '../src/households/households.service.js';
import { HouseholdRelationship } from '../src/generated/prisma/client.js';

describe('Households (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();
  const updateOwnProfile = vi.fn();

  const listOwn = vi.fn();
  const createOwn = vi.fn();
  const createAsAdmin = vi.fn();
  const update = vi.fn();
  const deactivate = vi.fn();
  const listSocietyHouseholds = vi.fn();
  const getUnitHousehold = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const memberId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    updateOwnProfile.mockReset();
    for (const fn of [
      listOwn,
      createOwn,
      createAsAdmin,
      update,
      deactivate,
      listSocietyHouseholds,
      getUnitHousehold,
    ]) {
      fn.mockReset();
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({
        ensureProfile,
        getProfileWithMemberships,
        updateOwnProfile,
      })
      .overrideProvider(HouseholdsService)
      .useValue({
        listOwn,
        createOwn,
        createAsAdmin,
        update,
        deactivate,
        listSocietyHouseholds,
        getUnitHousehold,
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

  it('wires profile and household routes', async () => {
    mockAuth({
      id: userId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });

    updateOwnProfile.mockResolvedValue({
      id: userId,
      displayName: 'Resident Updated',
      email: 'r@example.com',
      phone: '+919800011122',
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
    });
    listOwn.mockResolvedValue({
      membershipId: memberId,
      societyId,
      primaryUnitId: null,
      items: [],
    });
    createOwn.mockResolvedValue({
      id: memberId,
      membershipId: memberId,
      societyId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
      phone: null,
      email: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    deactivate.mockResolvedValue({
      id: memberId,
      membershipId: memberId,
      societyId,
      name: 'Aarav',
      relationship: HouseholdRelationship.CHILD,
      phone: null,
      email: null,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    listSocietyHouseholds.mockResolvedValue({
      items: [],
      page: 1,
      limit: 50,
      total: 0,
    });

    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer token')
      .send({ displayName: 'Resident Updated' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/me/household?societyId=${societyId}`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/me/household')
      .set('Authorization', 'Bearer token')
      .send({
        societyId,
        name: 'Aarav',
        relationship: HouseholdRelationship.CHILD,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/household-members/${memberId}/deactivate`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/households`)
      .set('Authorization', 'Bearer token')
      .expect(200);
  });
});
