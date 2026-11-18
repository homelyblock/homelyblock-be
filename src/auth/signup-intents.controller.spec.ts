import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { MembershipRole } from '../generated/prisma/client.js';
import { SignupIntentsController } from './signup-intents.controller.js';
import { UsersService } from './users.service.js';

describe('SignupIntentsController', () => {
  let app: INestApplication<App>;
  const recordSignupIntent = vi.fn();
  let secret: string | undefined = 'test-signup-intent-secret';

  beforeEach(async () => {
    recordSignupIntent.mockReset();
    secret = 'test-signup-intent-secret';
    const moduleRef = await Test.createTestingModule({
      controllers: [SignupIntentsController],
      providers: [
        { provide: UsersService, useValue: { recordSignupIntent } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'SIGNUP_INTENT_SECRET' ? secret : undefined,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const resident = {
    userId: '11111111-1111-4111-8111-111111111111',
    accountType: MembershipRole.RESIDENT_USER,
    societyName: 'Should not matter here',
    city: 'Pune',
  };

  it('rejects a missing or wrong signup-intent key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/signup-intents')
      .send(resident)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/signup-intents')
      .set('x-signup-intent-key', 'wrong-signup-intent-secret')
      .send(resident)
      .expect(401);

    expect(recordSignupIntent).not.toHaveBeenCalled();
  });

  it('returns 503 when the signup-intent secret is not configured', async () => {
    secret = undefined;
    await app.close();
    const moduleRef = await Test.createTestingModule({
      controllers: [SignupIntentsController],
      providers: [
        { provide: UsersService, useValue: { recordSignupIntent } },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    await request(app.getHttpServer())
      .post('/api/v1/signup-intents')
      .set('x-signup-intent-key', 'test-signup-intent-secret')
      .send(resident)
      .expect(503);

    expect(recordSignupIntent).not.toHaveBeenCalled();
  });

  it('rejects platform owner and unknown privilege fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/signup-intents')
      .set('x-signup-intent-key', 'test-signup-intent-secret')
      .send({ ...resident, accountType: 'PLATFORM_OWNER' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/signup-intents')
      .set('x-signup-intent-key', 'test-signup-intent-secret')
      .send({ ...resident, platformRole: 'PLATFORM_OWNER' })
      .expect(400);

    expect(recordSignupIntent).not.toHaveBeenCalled();
  });

  it('records a choice only after the server key matches', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/signup-intents')
      .set('x-signup-intent-key', 'test-signup-intent-secret')
      .send(resident)
      .expect(201);

    expect(recordSignupIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: resident.userId,
        accountType: MembershipRole.RESIDENT_USER,
      }),
    );
  });
});
