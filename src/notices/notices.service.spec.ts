import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  NoticeAudienceType,
  NoticeCategory,
  NoticeStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NoticesService } from './notices.service.js';

describe('NoticesService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const noticeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const buildingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const otherBuildingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'admin@example.com',
    platformRole: null,
  };
  const resident: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Resident',
    email: 'resident@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const assertCanViewSociety = vi.fn();
  const noticeCreate = vi.fn();
  const noticeFindUnique = vi.fn();
  const noticeFindMany = vi.fn();
  const noticeCount = vi.fn();
  const noticeUpdate = vi.fn();
  const buildingFindFirst = vi.fn();
  const unitFindFirst = vi.fn();
  const membershipFindFirst = vi.fn();
  const membershipFindMany = vi.fn();
  const noticeReadCreate = vi.fn();
  const noticeReadFindUnique = vi.fn();
  const noticeReadCount = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();

  let service: NoticesService;

  const draftNotice = {
    id: noticeId,
    societyId,
    title: 'Title',
    body: 'Body',
    category: NoticeCategory.GENERAL,
    audienceType: NoticeAudienceType.SOCIETY,
    targetBuildingId: null,
    targetUnitId: null,
    status: NoticeStatus.DRAFT,
    createdByUserId: admin.id,
    publishedAt: null,
    createdAt: new Date('2026-10-30T10:00:00.000Z'),
    updatedAt: new Date('2026-10-30T10:00:00.000Z'),
  };

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    assertCanViewSociety.mockReset().mockResolvedValue({
      id: 'm1',
      societyId,
      userId: admin.id,
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
    });
    for (const fn of [
      noticeCreate,
      noticeFindUnique,
      noticeFindMany,
      noticeCount,
      noticeUpdate,
      buildingFindFirst,
      unitFindFirst,
      membershipFindFirst,
      membershipFindMany,
      noticeReadCreate,
      noticeReadFindUnique,
      noticeReadCount,
      auditCreate,
      transaction,
    ]) {
      fn.mockReset();
    }
    auditCreate.mockResolvedValue({});

    service = new NoticesService(
      {
        notice: {
          create: noticeCreate,
          findUnique: noticeFindUnique,
          findMany: noticeFindMany,
          count: noticeCount,
          update: noticeUpdate,
        },
        building: { findFirst: buildingFindFirst },
        unit: { findFirst: unitFindFirst },
        societyMembership: {
          findFirst: membershipFindFirst,
          findMany: membershipFindMany,
        },
        noticeRead: {
          create: noticeReadCreate,
          findUnique: noticeReadFindUnique,
          count: noticeReadCount,
        },
        auditLog: { create: auditCreate },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
        assertCanViewSociety,
      } as unknown as AuthorizationService,
    );
  });

  it('creates a draft society notice', async () => {
    noticeCreate.mockResolvedValue({
      ...draftNotice,
      createdBy: { displayName: 'Admin' },
    });

    const result = await service.create(admin, societyId, {
      title: ' Title ',
      body: ' Body ',
    });

    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(noticeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NoticeStatus.DRAFT,
          audienceType: NoticeAudienceType.SOCIETY,
          createdByUserId: admin.id,
        }),
      }),
    );
    expect(result.status).toBe(NoticeStatus.DRAFT);
  });

  it('rejects building targets from another society', async () => {
    buildingFindFirst.mockResolvedValue(null);

    await expect(
      service.create(admin, societyId, {
        title: 'Title',
        body: 'Body',
        audienceType: NoticeAudienceType.BUILDING,
        targetBuildingId: otherBuildingId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hides draft notices from residents', async () => {
    assertCanViewSociety.mockResolvedValue({
      id: 'm2',
      societyId,
      userId: resident.id,
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: unitId,
    });
    membershipFindFirst.mockResolvedValue(null);
    noticeFindUnique.mockResolvedValue({
      ...draftNotice,
      createdBy: { displayName: 'Admin' },
      reads: [],
    });

    await expect(service.getById(resident, noticeId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('publishes drafts and rejects publishing archived notices', async () => {
    noticeFindUnique.mockResolvedValue(draftNotice);
    noticeUpdate.mockResolvedValue({
      ...draftNotice,
      status: NoticeStatus.PUBLISHED,
      publishedAt: new Date('2026-10-30T11:00:00.000Z'),
      createdBy: { displayName: 'Admin' },
    });

    const published = await service.publish(admin, noticeId);
    expect(published.status).toBe(NoticeStatus.PUBLISHED);

    noticeFindUnique.mockResolvedValue({
      ...draftNotice,
      status: NoticeStatus.ARCHIVED,
    });
    await expect(service.publish(admin, noticeId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('marks reads idempotently on unique conflicts', async () => {
    noticeFindUnique.mockResolvedValue({
      ...draftNotice,
      status: NoticeStatus.PUBLISHED,
      publishedAt: new Date(),
    });
    assertCanViewSociety.mockResolvedValue({
      id: 'm2',
      societyId,
      userId: resident.id,
      role: MembershipRole.RESIDENT_USER,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
    });
    membershipFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        primaryUnitId: null,
        primaryUnit: null,
      });
    noticeReadCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    noticeReadFindUnique.mockResolvedValue({
      noticeId,
      userId: resident.id,
      readAt: new Date('2026-10-30T12:00:00.000Z'),
    });

    const result = await service.markRead(resident, noticeId);
    expect(result.readAt).toBe('2026-10-30T12:00:00.000Z');
  });

  it('computes readership from eligible residents only', async () => {
    noticeFindUnique.mockResolvedValue({
      ...draftNotice,
      status: NoticeStatus.PUBLISHED,
    });
    membershipFindMany.mockResolvedValue([
      { userId: resident.id },
      { userId: '33333333-3333-4333-8333-333333333333' },
    ]);
    noticeReadCount.mockResolvedValue(1);

    const stats = await service.getReadership(admin, noticeId);
    expect(stats).toEqual({
      noticeId,
      eligibleRecipients: 2,
      readCount: 1,
      unreadCount: 1,
      readPercentage: 50,
    });
  });

  it('denies readership to non-admins', async () => {
    noticeFindUnique.mockResolvedValue(draftNotice);
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(
      service.getReadership(resident, noticeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates unit belongs to society and optional building', async () => {
    unitFindFirst.mockResolvedValue({ id: unitId, buildingId });

    noticeCreate.mockResolvedValue({
      ...draftNotice,
      audienceType: NoticeAudienceType.UNIT,
      targetBuildingId: buildingId,
      targetUnitId: unitId,
      createdBy: { displayName: 'Admin' },
    });

    await service.create(admin, societyId, {
      title: 'Unit notice',
      body: 'Body',
      audienceType: NoticeAudienceType.UNIT,
      targetUnitId: unitId,
      targetBuildingId: buildingId,
    });

    unitFindFirst.mockResolvedValue({ id: unitId, buildingId });
    await expect(
      service.create(admin, societyId, {
        title: 'Bad',
        body: 'Body',
        audienceType: NoticeAudienceType.UNIT,
        targetUnitId: unitId,
        targetBuildingId: otherBuildingId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
