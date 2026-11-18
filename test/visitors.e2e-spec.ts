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
import {
  VisitorEntryType,
  VisitorStatus,
} from '../src/generated/prisma/client.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { VisitorsService } from '../src/visitors/visitors.service.js';

describe('Visitors (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();

  const createExpected = vi.fn();
  const createWalkIn = vi.fn();
  const list = vi.fn();
  const getById = vi.fn();
  const approve = vi.fn();
  const reject = vi.fn();
  const cancel = vi.fn();
  const checkIn = vi.fn();
  const checkOut = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const visitorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const residentId = '33333333-3333-4333-8333-333333333333';
  const adminId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    for (const fn of [
      createExpected,
      createWalkIn,
      list,
      getById,
      approve,
      reject,
      cancel,
      checkIn,
      checkOut,
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
      .overrideProvider(VisitorsService)
      .useValue({
        createExpected,
        createWalkIn,
        list,
        getById,
        approve,
        reject,
        cancel,
        checkIn,
        checkOut,
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

  it('registers an expected visitor', async () => {
    mockAuth({
      id: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });
    createExpected.mockResolvedValue({
      id: visitorId,
      status: VisitorStatus.PENDING,
      entryType: VisitorEntryType.EXPECTED,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/visitors/expected`)
      .set('Authorization', 'Bearer token')
      .send({
        visitorName: 'Guest',
        visitorPhone: '+919876543210',
        purpose: 'Family',
        expectedAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
  });

  it('validates expected visitor payloads', async () => {
    mockAuth({
      id: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/visitors/expected`)
      .set('Authorization', 'Bearer token')
      .send({ visitorName: '', visitorPhone: 'abc', purpose: '' })
      .expect(400);

    expect(createExpected).not.toHaveBeenCalled();
  });

  it('registers walk-ins and supports lifecycle actions', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    createWalkIn.mockResolvedValue({
      id: visitorId,
      status: VisitorStatus.PENDING,
      entryType: VisitorEntryType.WALK_IN,
      unitId,
    });
    approve.mockResolvedValue({ id: visitorId, status: VisitorStatus.APPROVED });
    checkIn.mockResolvedValue({
      id: visitorId,
      status: VisitorStatus.CHECKED_IN,
    });
    checkOut.mockResolvedValue({
      id: visitorId,
      status: VisitorStatus.CHECKED_OUT,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/visitors/walk-ins`)
      .set('Authorization', 'Bearer token')
      .send({
        unitId,
        visitorName: 'Courier',
        visitorPhone: '+919811122233',
        purpose: 'Delivery',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/visitors/${visitorId}/approve`)
      .set('Authorization', 'Bearer token')
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/visitors/${visitorId}/check-in`)
      .set('Authorization', 'Bearer token')
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/visitors/${visitorId}/check-out`)
      .set('Authorization', 'Bearer token')
      .expect(201);
  });

  it('surfaces authorization and not-found failures', async () => {
    mockAuth({
      id: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });
    createWalkIn.mockRejectedValue(
      new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      }),
    );
    getById.mockRejectedValue(
      new NotFoundException({ message: 'Visitor not found', code: 'NOT_FOUND' }),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/visitors/walk-ins`)
      .set('Authorization', 'Bearer token')
      .send({
        unitId,
        visitorName: 'Courier',
        visitorPhone: '+919811122233',
        purpose: 'Delivery',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/visitors/${visitorId}`)
      .set('Authorization', 'Bearer token')
      .expect(404);
  });
});
