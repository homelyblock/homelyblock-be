import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from './../src/common/configure-app.js';
import { AppModule } from './../src/app.module.js';

describe('Backend bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, { swagger: true });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps the starter greeting at GET /', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('reports health at GET /api/v1/health', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
      },
    });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows configured CORS origins and rejects credentials-by-default wildcards', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );

    const denied = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example')
      .expect(200);

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a stable error body for unknown routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: expect.any(String),
      details: [],
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('serves Swagger outside the /api/v1 prefix', () => {
    return request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('does not enable Express trust proxy (rate-limit IP spoofing defense)', () => {
    // Nest wraps Express; unset trust proxy means client X-Forwarded-For is ignored.
    const trust = (
      app.getHttpAdapter().getInstance() as {
        get: (key: string) => unknown;
      }
    ).get('trust proxy');
    expect(trust).toBeFalsy();
  });
});

describe('Backend bootstrap swagger disabled (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Production default is covered by isSwaggerEnabled unit tests; this proves
    // the disabled path does not mount /api/docs (ConfigModule+.env makes a
    // live NODE_ENV=production boot unreliable inside the shared e2e process).
    configureApp(app, { swagger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not serve Swagger when swagger is disabled', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });
});
