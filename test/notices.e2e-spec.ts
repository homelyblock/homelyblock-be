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
  NoticeAudienceType,
  NoticeCategory,
  NoticeStatus,
  PlatformRole,
} from '../src/generated/prisma/client.js';
import { NoticesService } from '../src/notices/notices.service.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';

describe('Notices (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();

  const list = vi.fn();
  const create = vi.fn();
  const getById = vi.fn();
  const update = vi.fn();
  const publish = vi.fn();
  const archive = vi.fn();
  const markRead = vi.fn();
  const getReadership = vi.fn();

  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const noticeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const adminId = '22222222-2222-4222-8222-222222222222';
  const residentId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    getProfileWithMemberships.mockReset();
    for (const fn of [
      list,
      create,
      getById,
      update,
      publish,
      archive,
      markRead,
      getReadership,
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
      .overrideProvider(NoticesService)
      .useValue({
        list,
        create,
        getById,
        update,
        publish,
        archive,
        markRead,
        getReadership,
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

  it('creates a notice via society path', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    create.mockResolvedValue({
      id: noticeId,
      societyId,
      title: 'Hello',
      body: 'World',
      category: NoticeCategory.GENERAL,
      audienceType: NoticeAudienceType.SOCIETY,
      targetBuildingId: null,
      targetUnitId: null,
      status: NoticeStatus.DRAFT,
      createdByUserId: adminId,
      publishedAt: null,
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.000Z',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', 'Bearer token')
      .send({ title: 'Hello', body: 'World' })
      .expect(201);

    expect(create).toHaveBeenCalled();
  });

  it('validates create payloads', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: PlatformRole.PLATFORM_OWNER,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', 'Bearer token')
      .send({ title: '', body: '' })
      .expect(400);

    expect(create).not.toHaveBeenCalled();
  });

  it('publishes, archives, marks read, and returns readership', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    publish.mockResolvedValue({ id: noticeId, status: NoticeStatus.PUBLISHED });
    archive.mockResolvedValue({ id: noticeId, status: NoticeStatus.ARCHIVED });
    markRead.mockResolvedValue({
      noticeId,
      readAt: '2026-10-30T12:00:00.000Z',
    });
    getReadership.mockResolvedValue({
      noticeId,
      eligibleRecipients: 2,
      readCount: 1,
      unreadCount: 1,
      readPercentage: 50,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/notices/${noticeId}/publish`)
      .set('Authorization', 'Bearer token')
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/notices/${noticeId}/archive`)
      .set('Authorization', 'Bearer token')
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/notices/${noticeId}/read`)
      .set('Authorization', 'Bearer token')
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/notices/${noticeId}/readership`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(response.body.data.readPercentage).toBe(50);
  });

  it('surfaces authorization failures from the service', async () => {
    mockAuth({
      id: residentId,
      displayName: 'Resident',
      email: 'r@example.com',
      platformRole: null,
    });
    create.mockRejectedValue(
      new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      }),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/societies/${societyId}/notices`)
      .set('Authorization', 'Bearer token')
      .send({ title: 'Hello', body: 'World' })
      .expect(403);
  });

  it('surfaces cross-society not found', async () => {
    mockAuth({
      id: adminId,
      displayName: 'Admin',
      email: 'a@example.com',
      platformRole: null,
    });
    getById.mockRejectedValue(
      new NotFoundException({ message: 'Notice not found', code: 'NOT_FOUND' }),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/notices/${noticeId}`)
      .set('Authorization', 'Bearer token')
      .expect(404);
  });
});
