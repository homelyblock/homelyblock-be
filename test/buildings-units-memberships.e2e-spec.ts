import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
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
import { BuildingsService } from '../src/buildings/buildings.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  UnitStatus,
} from '../src/generated/prisma/client.js';
import { MembershipsService } from '../src/memberships/memberships.service.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { UnitsService } from '../src/units/units.service.js';

describe('Buildings, units, memberships (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();

  const listBuildings = vi.fn();
  const createBuilding = vi.fn();
  const getBuilding = vi.fn();
  const updateBuilding = vi.fn();

  const listUnits = vi.fn();
  const createUnit = vi.fn();
  const getUnit = vi.fn();
  const updateUnit = vi.fn();

  const listMembers = vi.fn();
  const createMember = vi.fn();
  const updateMember = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const buildingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const membershipId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const adminId = '22222222-2222-4222-8222-222222222222';
  const residentId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    for (const fn of [
      listBuildings,
      createBuilding,
      getBuilding,
      updateBuilding,
      listUnits,
      createUnit,
      getUnit,
      updateUnit,
      listMembers,
      createMember,
      updateMember,
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
      })
      .overrideProvider(BuildingsService)
      .useValue({
        list: listBuildings,
        create: createBuilding,
        getById: getBuilding,
        update: updateBuilding,
      })
      .overrideProvider(UnitsService)
      .useValue({
        listBySociety: listUnits,
        create: createUnit,
        getById: getUnit,
        update: updateUnit,
      })
      .overrideProvider(MembershipsService)
      .useValue({
        list: listMembers,
        create: createMember,
        update: updateMember,
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

  it('delegates an authenticated building list to the service', async () => {
    mockAuth({
      id: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });
    listBuildings.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/buildings`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(listBuildings).toHaveBeenCalled();
  });

  it('creates a building via society admin path', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    createBuilding.mockResolvedValue({
      id: buildingId,
      societyId,
      name: 'Wing A',
      code: 'A',
      createdAt: '2026-10-29T12:00:00.000Z',
      updatedAt: '2026-10-29T12:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/buildings`)
      .set('Authorization', 'Bearer token')
      .send({ name: 'Wing A', code: 'A' })
      .expect(201);

    expect(response.body.data.code).toBe('A');
  });

  it('validates building payloads', async () => {
    mockAuth({
      id: ownerId,
      displayName: 'Owner',
      email: 'o@example.com',
      platformRole: PlatformRole.PLATFORM_OWNER,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/buildings`)
      .set('Authorization', 'Bearer token')
      .send({ name: '', code: '!!' })
      .expect(400);

    expect(createBuilding).not.toHaveBeenCalled();
  });

  it('creates a unit under a society building', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    createUnit.mockResolvedValue({
      id: unitId,
      societyId,
      buildingId,
      unitNumber: '101',
      status: UnitStatus.ACTIVE,
      createdAt: '2026-10-29T12:00:00.000Z',
      updatedAt: '2026-10-29T12:00:00.000Z',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/units`)
      .set('Authorization', 'Bearer token')
      .send({ buildingId, unitNumber: '101' })
      .expect(201);
  });

  it('creates a membership for an existing user', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    createMember.mockResolvedValue({
      id: membershipId,
      societyId,
      userId: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.INVITED,
      primaryUnitId: null,
      createdAt: '2026-10-29T12:00:00.000Z',
      updatedAt: '2026-10-29T12:00:00.000Z',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/members`)
      .set('Authorization', 'Bearer token')
      .send({
        userId: residentId,
        role: MembershipRole.RESIDENT_USER,
      })
      .expect(201);
  });

  it('patches memberships by membership id', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    updateMember.mockResolvedValue({
      id: membershipId,
      societyId,
      userId: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: unitId,
      createdAt: '2026-10-29T12:00:00.000Z',
      updatedAt: '2026-10-29T12:00:00.000Z',
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/memberships/${membershipId}`)
      .set('Authorization', 'Bearer token')
      .send({
        status: MembershipStatus.ACTIVE,
        primaryUnitId: unitId,
      })
      .expect(200);
  });

  it('surfaces service authorization failures', async () => {
    mockAuth({
      id: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });
    createBuilding.mockRejectedValue(
      new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      }),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/buildings`)
      .set('Authorization', 'Bearer token')
      .send({ name: 'Wing A', code: 'A' })
      .expect(403);
  });

  it('surfaces cross-society not found from services', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    getBuilding.mockRejectedValue(
      new NotFoundException({
        message: 'Building not found',
        code: 'NOT_FOUND',
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/buildings/${buildingId}`)
      .set('Authorization', 'Bearer token')
      .expect(404);
  });
});
