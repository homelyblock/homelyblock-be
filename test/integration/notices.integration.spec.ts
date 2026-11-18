import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  NoticeAudienceType,
  NoticeCategory,
  NoticeStatus,
  PlatformRole,
  PrismaClient,
} from '../../src/generated/prisma/client.js';
import { NoticesService } from '../../src/notices/notices.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Notices PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let notices: NoticesService;

  const ownerId = randomUUID();
  const adminAId = randomUUID();
  const adminBId = randomUUID();
  const residentA1Id = randomUUID();
  const residentA2Id = randomUUID();
  const residentBId = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let buildingAId = '';
  let buildingBId = '';
  let unitA1Id = '';
  let unitA2Id = '';

  const adminA = {
    id: adminAId,
    displayName: 'Admin A',
    email: 'admin-a-notices@example.com',
    platformRole: null,
  };
  const adminB = {
    id: adminBId,
    displayName: 'Admin B',
    email: 'admin-b-notices@example.com',
    platformRole: null,
  };
  const residentA1 = {
    id: residentA1Id,
    displayName: 'Resident A1',
    email: 'resident-a1-notices@example.com',
    platformRole: null,
  };
  const residentA2 = {
    id: residentA2Id,
    displayName: 'Resident A2',
    email: 'resident-a2-notices@example.com',
    platformRole: null,
  };

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
    const prismaService = prisma as unknown as PrismaService;
    notices = new NoticesService(
      prismaService,
      new AuthorizationService(prismaService),
    );

    await prisma.noticeRead.deleteMany();
    await prisma.notice.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        {
          id: ownerId,
          displayName: 'Owner',
          email: 'owner-notices@example.com',
          platformRole: PlatformRole.PLATFORM_OWNER,
        },
        {
          id: adminAId,
          displayName: 'Admin A',
          email: 'admin-a-notices@example.com',
        },
        {
          id: adminBId,
          displayName: 'Admin B',
          email: 'admin-b-notices@example.com',
        },
        {
          id: residentA1Id,
          displayName: 'Resident A1',
          email: 'resident-a1-notices@example.com',
        },
        {
          id: residentA2Id,
          displayName: 'Resident A2',
          email: 'resident-a2-notices@example.com',
        },
        {
          id: residentBId,
          displayName: 'Resident B',
          email: 'resident-b-notices@example.com',
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Society A Notices', city: 'Pune', state: 'MH' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Society B Notices', city: 'Nashik', state: 'MH' },
    });
    societyAId = societyA.id;
    societyBId = societyB.id;

    const buildingA = await prisma.building.create({
      data: { societyId: societyAId, name: 'Wing A', code: 'A' },
    });
    const buildingB = await prisma.building.create({
      data: { societyId: societyBId, name: 'Wing B', code: 'B' },
    });
    buildingAId = buildingA.id;
    buildingBId = buildingB.id;

    const unitA1 = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitNumber: '101',
      },
    });
    const unitA2 = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitNumber: '102',
      },
    });
    unitA1Id = unitA1.id;
    unitA2Id = unitA2.id;

    await prisma.societyMembership.createMany({
      data: [
        {
          societyId: societyAId,
          userId: adminAId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyBId,
          userId: adminBId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyAId,
          userId: residentA1Id,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitA1Id,
        },
        {
          societyId: societyAId,
          userId: residentA2Id,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitA2Id,
        },
        {
          societyId: societyBId,
          userId: residentBId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.noticeRead.deleteMany();
    await prisma.notice.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('lets admins create/publish and hides drafts from residents', async () => {
    const draft = await notices.create(adminA, societyAId, {
      title: 'Draft notice',
      body: 'Not ready',
      category: NoticeCategory.IMPORTANT,
    });
    expect(draft.status).toBe(NoticeStatus.DRAFT);

    await expect(notices.getById(residentA1, draft.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const published = await notices.publish(adminA, draft.id);
    expect(published.status).toBe(NoticeStatus.PUBLISHED);
    expect(published.publishedAt).toBeTruthy();

    const visible = await notices.getById(residentA1, published.id);
    expect(visible.title).toBe('Draft notice');
  });

  it('denies cross-society admin access and invalid audience targets', async () => {
    await expect(
      notices.create(adminB, societyAId, {
        title: 'Hack',
        body: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      notices.create(adminA, societyAId, {
        title: 'Bad building',
        body: 'Nope',
        audienceType: NoticeAudienceType.BUILDING,
        targetBuildingId: buildingBId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      notices.create(residentA1, societyAId, {
        title: 'Resident create',
        body: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters building/unit audiences for residents', async () => {
    const buildingNotice = await notices.create(adminA, societyAId, {
      title: 'Wing A only',
      body: 'Body',
      audienceType: NoticeAudienceType.BUILDING,
      targetBuildingId: buildingAId,
    });
    await notices.publish(adminA, buildingNotice.id);

    const unitNotice = await notices.create(adminA, societyAId, {
      title: 'Unit 101 only',
      body: 'Body',
      audienceType: NoticeAudienceType.UNIT,
      targetUnitId: unitA1Id,
    });
    await notices.publish(adminA, unitNotice.id);

    const forA1 = await notices.list(residentA1, societyAId, {
      page: 1,
      limit: 50,
    });
    const titlesA1 = forA1.items.map((item) => item.title);
    expect(titlesA1).toContain('Wing A only');
    expect(titlesA1).toContain('Unit 101 only');

    const forA2 = await notices.list(residentA2, societyAId, {
      page: 1,
      limit: 50,
    });
    const titlesA2 = forA2.items.map((item) => item.title);
    expect(titlesA2).toContain('Wing A only');
    expect(titlesA2).not.toContain('Unit 101 only');

    await expect(
      notices.getById(residentA2, unitNotice.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives published notices and hides them from residents', async () => {
    const notice = await notices.create(adminA, societyAId, {
      title: 'To archive',
      body: 'Body',
    });
    await notices.publish(adminA, notice.id);
    await notices.archive(adminA, notice.id);

    await expect(notices.getById(residentA1, notice.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const adminView = await notices.getById(adminA, notice.id);
    expect(adminView.status).toBe(NoticeStatus.ARCHIVED);

    await expect(notices.archive(adminA, notice.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('records reads uniquely and computes readership against eligible audience', async () => {
    const notice = await notices.create(adminA, societyAId, {
      title: 'Readership test',
      body: 'Body',
      audienceType: NoticeAudienceType.UNIT,
      targetUnitId: unitA1Id,
    });
    await notices.publish(adminA, notice.id);

    const first = await notices.markRead(residentA1, notice.id);
    const second = await notices.markRead(residentA1, notice.id);
    expect(second.readAt).toBe(first.readAt);

    await expect(
      notices.markRead(residentA2, notice.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      notices.getReadership(residentA1, notice.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const stats = await notices.getReadership(adminA, notice.id);
    expect(stats.eligibleRecipients).toBe(1);
    expect(stats.readCount).toBe(1);
    expect(stats.unreadCount).toBe(0);
    expect(stats.readPercentage).toBe(100);

    const count = await prisma.noticeRead.count({
      where: { noticeId: notice.id },
    });
    expect(count).toBe(1);
  });
});
