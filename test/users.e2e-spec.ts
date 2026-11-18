import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
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
import { AuthorizationService } from '../src/authorization/authorization.service.js';
import { PlatformRole } from '../src/generated/prisma/client.js';
import { configureApp } from '../src/common/configure-app.js';
import { AppModule } from '../src/app.module.js';

describe('Users search (e2e)', () => {
  let app: INestApplication<App>;
  const verify = vi.fn<TokenVerifier['verify']>();
  const ensureProfile = vi.fn<UsersService['ensureProfile']>();
  const searchProfiles = vi.fn<UsersService['searchProfiles']>();
  const getProfileWithMemberships =
    vi.fn<UsersService['getProfileWithMemberships']>();
  const resolveUserSearchScope =
    vi.fn<AuthorizationService['resolveUserSearchScope']>();

  beforeEach(async () => {
    verify.mockReset();
    ensureProfile.mockReset();
    searchProfiles.mockReset();
    getProfileWithMemberships.mockReset();
    resolveUserSearchScope.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify } satisfies TokenVerifier)
      .overrideProvider(UsersService)
      .useValue({
        ensureProfile,
        searchProfiles,
        getProfileWithMemberships,
      })
      .overrideProvider(AuthorizationService)
      .useValue({
        resolveUserSearchScope,
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

  it('allows platform owners to search users', async () => {
    mockAuth({
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Owner',
      email: 'owner@example.com',
      platformRole: PlatformRole.PLATFORM_OWNER,
    });
    resolveUserSearchScope.mockResolvedValue({ type: 'platform' });
    searchProfiles.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        displayName: 'Admin',
        email: 'admin@example.com',
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/users/search?q=adm&limit=10')
      .set('Authorization', 'Bearer owner-token')
      .expect(200);

    expect(resolveUserSearchScope).toHaveBeenCalledWith(
      expect.objectContaining({ platformRole: PlatformRole.PLATFORM_OWNER }),
      undefined,
    );
    expect(searchProfiles).toHaveBeenCalledWith('adm', 10, { type: 'platform' });
    expect(response.body.data.items).toHaveLength(1);
  });

  it('scopes society admin search to the requested society', async () => {
    mockAuth({
      id: '22222222-2222-4222-8222-222222222222',
      displayName: 'Admin',
      email: 'admin@example.com',
      platformRole: null,
    });
    const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    resolveUserSearchScope.mockResolvedValue({ type: 'society', societyId });
    searchProfiles.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get(`/api/v1/users/search?q=res&societyId=${societyId}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(resolveUserSearchScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222' }),
      societyId,
    );
    expect(searchProfiles).toHaveBeenCalledWith('res', 10, {
      type: 'society',
      societyId,
    });
  });

  it('rejects society admin search that omits societyId', async () => {
    mockAuth({
      id: '22222222-2222-4222-8222-222222222222',
      displayName: 'Admin',
      email: 'admin@example.com',
      platformRole: null,
    });
    resolveUserSearchScope.mockRejectedValue(
      new BadRequestException({
        message: 'societyId is required to search users',
        code: 'BAD_REQUEST',
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/users/search?q=res')
      .set('Authorization', 'Bearer admin-token')
      .expect(400);

    expect(searchProfiles).not.toHaveBeenCalled();
  });

  it('denies residents from user search', async () => {
    mockAuth({
      id: '33333333-3333-4333-8333-333333333333',
      displayName: 'Resident',
      platformRole: null,
    });
    resolveUserSearchScope.mockRejectedValue(
      new ForbiddenException({
        message: 'You do not have permission to search users',
        code: 'FORBIDDEN',
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/users/search?q=adm')
      .set('Authorization', 'Bearer resident-token')
      .expect(403);

    expect(searchProfiles).not.toHaveBeenCalled();
  });
});
