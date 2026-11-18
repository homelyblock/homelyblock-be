import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  TOKEN_VERIFIER,
  type AuthenticatedUser,
  type TokenVerifier,
} from '../src/auth/auth.types.js';
import { UsersService } from '../src/auth/users.service.js';
import { BillingService } from '../src/billing/billing.service.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';

describe('Billing (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();

  const createConfig = vi.fn();
  const listConfigs = vi.fn();
  const previewBills = vi.fn();
  const generateBills = vi.fn();
  const listBills = vi.fn();
  const getDashboard = vi.fn();
  const recordPayment = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const adminId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    for (const fn of [
      createConfig,
      listConfigs,
      previewBills,
      generateBills,
      listBills,
      getDashboard,
      recordPayment,
    ]) {
      fn.mockReset();
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({ ensureProfile, getProfileWithMemberships })
      .overrideProvider(BillingService)
      .useValue({
        createConfig,
        listConfigs,
        updateConfig: vi.fn(),
        previewBills,
        generateBills,
        listBills,
        getBill: vi.fn(),
        publishBill: vi.fn(),
        publishPeriod: vi.fn(),
        cancelBill: vi.fn(),
        recordPayment,
        reversePayment: vi.fn(),
        listPaymentsForBill: vi.fn(),
        getDashboard,
        getInvoicePdf: vi.fn(),
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

  it('creates a maintenance config', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    createConfig.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      monthlyAmount: '1500.00',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/maintenance-configs`)
      .set('Authorization', 'Bearer token')
      .send({
        name: 'Monthly',
        monthlyAmount: '1500.00',
        dueDayOfMonth: 10,
      })
      .expect(201);
  });

  it('validates config payloads', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/maintenance-configs`)
      .set('Authorization', 'Bearer token')
      .send({ name: '', monthlyAmount: 'x', dueDayOfMonth: 40 })
      .expect(400);

    expect(createConfig).not.toHaveBeenCalled();
  });

  it('surfaces forbidden dashboard access', async () => {
    mockAuth({
      id: '33333333-3333-4333-8333-333333333333',
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });
    getDashboard.mockRejectedValue(
      new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/societies/${societyId}/billing-dashboard`)
      .set('Authorization', 'Bearer token')
      .expect(403);
  });
});
