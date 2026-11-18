import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  NoticeAudienceType,
  NoticeCategory,
  NoticeStatus,
  PlatformRole,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateNoticeDto } from './dto/create-notice.dto.js';
import type { ListNoticesQueryDto } from './dto/list-notices-query.dto.js';
import type { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { toNoticeDto, type NoticeDto } from './notices.mapper.js';

export type PaginatedNotices = {
  items: NoticeDto[];
  page: number;
  limit: number;
  total: number;
};

export type NoticeReadershipDto = {
  noticeId: string;
  eligibleRecipients: number;
  readCount: number;
  unreadCount: number;
  readPercentage: number;
};

type AudienceTargets = {
  audienceType: NoticeAudienceType;
  targetBuildingId: string | null;
  targetUnitId: string | null;
};

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async create(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateNoticeDto,
  ): Promise<NoticeDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const audience = await this.resolveAudience(societyId, {
      audienceType: dto.audienceType ?? NoticeAudienceType.SOCIETY,
      targetBuildingId: dto.targetBuildingId,
      targetUnitId: dto.targetUnitId,
    });

    const notice = await this.prisma.notice.create({
      data: {
        societyId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        category: dto.category ?? NoticeCategory.GENERAL,
        audienceType: audience.audienceType,
        targetBuildingId: audience.targetBuildingId,
        targetUnitId: audience.targetUnitId,
        status: NoticeStatus.DRAFT,
        createdByUserId: user.id,
      },
      include: {
        createdBy: { select: { displayName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        societyId,
        actorUserId: user.id,
        action: 'notice.create',
        entityType: 'notice',
        entityId: notice.id,
        metadata: {
          status: notice.status,
          audienceType: notice.audienceType,
        },
      },
    });

    return toNoticeDto(notice);
  }

  async list(
    user: AuthenticatedUser,
    societyId: string,
    query: ListNoticesQueryDto,
  ): Promise<PaginatedNotices> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin = await this.isSocietyAdmin(user, societyId, membership?.role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = await this.buildListWhere({
      societyId,
      isAdmin,
      userId: user.id,
      statusFilter: query.status,
    });

    const [total, notices] = await this.prisma.$transaction([
      this.prisma.notice.count({ where }),
      this.prisma.notice.findMany({
        where,
        orderBy: [
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { displayName: true } },
          reads: {
            where: { userId: user.id },
            select: { readAt: true },
            take: 1,
          },
        },
      }),
    ]);

    return {
      items: notices.map((notice) =>
        toNoticeDto(notice, {
          isRead: notice.reads.length > 0,
          readAt: notice.reads[0]?.readAt ?? null,
        }),
      ),
      page,
      limit,
      total,
    };
  }

  async getById(user: AuthenticatedUser, noticeId: string): Promise<NoticeDto> {
    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      include: {
        createdBy: { select: { displayName: true } },
        reads: {
          where: { userId: user.id },
          select: { readAt: true },
          take: 1,
        },
      },
    });
    if (!notice) {
      throw new NotFoundException({
        message: 'Notice not found',
        code: 'NOT_FOUND',
      });
    }

    await this.assertCanAccessNotice(user, notice);

    return toNoticeDto(notice, {
      isRead: notice.reads.length > 0,
      readAt: notice.reads[0]?.readAt ?? null,
    });
  }

  async update(
    user: AuthenticatedUser,
    noticeId: string,
    dto: UpdateNoticeDto,
  ): Promise<NoticeDto> {
    const existing = await this.requireNotice(noticeId);
    await this.authorization.assertCanAdministerSociety(
      user,
      existing.societyId,
    );

    if (existing.status !== NoticeStatus.DRAFT) {
      throw new ConflictException({
        message: 'Only draft notices can be edited',
        code: 'CONFLICT',
      });
    }

    if (
      dto.title === undefined &&
      dto.body === undefined &&
      dto.category === undefined &&
      dto.audienceType === undefined &&
      dto.targetBuildingId === undefined &&
      dto.targetUnitId === undefined
    ) {
      throw new BadRequestException({
        message: 'No updatable fields were provided',
        code: 'BAD_REQUEST',
      });
    }

    const audienceTouched =
      dto.audienceType !== undefined ||
      dto.targetBuildingId !== undefined ||
      dto.targetUnitId !== undefined;

    const audience = audienceTouched
      ? await this.resolveAudience(existing.societyId, {
          audienceType: dto.audienceType ?? existing.audienceType,
          targetBuildingId:
            dto.targetBuildingId !== undefined
              ? (dto.targetBuildingId ?? undefined)
              : (existing.targetBuildingId ?? undefined),
          targetUnitId:
            dto.targetUnitId !== undefined
              ? (dto.targetUnitId ?? undefined)
              : (existing.targetUnitId ?? undefined),
        })
      : null;

    const data: Prisma.NoticeUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(audience
        ? {
            audienceType: audience.audienceType,
            targetBuildingId: audience.targetBuildingId,
            targetUnitId: audience.targetUnitId,
          }
        : {}),
    };

    const notice = await this.prisma.notice.update({
      where: { id: noticeId },
      data,
      include: {
        createdBy: { select: { displayName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        societyId: existing.societyId,
        actorUserId: user.id,
        action: 'notice.update',
        entityType: 'notice',
        entityId: notice.id,
        metadata: {
          audienceType: notice.audienceType,
        },
      },
    });

    return toNoticeDto(notice);
  }

  async publish(
    user: AuthenticatedUser,
    noticeId: string,
  ): Promise<NoticeDto> {
    const existing = await this.requireNotice(noticeId);
    await this.authorization.assertCanAdministerSociety(
      user,
      existing.societyId,
    );

    if (existing.status === NoticeStatus.PUBLISHED) {
      throw new ConflictException({
        message: 'Notice is already published',
        code: 'CONFLICT',
      });
    }
    if (existing.status === NoticeStatus.ARCHIVED) {
      throw new ConflictException({
        message: 'Archived notices cannot be published',
        code: 'CONFLICT',
      });
    }

    const notice = await this.prisma.notice.update({
      where: { id: noticeId },
      data: {
        status: NoticeStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: {
        createdBy: { select: { displayName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        societyId: existing.societyId,
        actorUserId: user.id,
        action: 'notice.publish',
        entityType: 'notice',
        entityId: notice.id,
      },
    });

    return toNoticeDto(notice);
  }

  async archive(
    user: AuthenticatedUser,
    noticeId: string,
  ): Promise<NoticeDto> {
    const existing = await this.requireNotice(noticeId);
    await this.authorization.assertCanAdministerSociety(
      user,
      existing.societyId,
    );

    if (existing.status === NoticeStatus.ARCHIVED) {
      throw new ConflictException({
        message: 'Notice is already archived',
        code: 'CONFLICT',
      });
    }
    if (existing.status === NoticeStatus.DRAFT) {
      throw new ConflictException({
        message: 'Draft notices cannot be archived; delete or leave as draft',
        code: 'CONFLICT',
      });
    }

    const notice = await this.prisma.notice.update({
      where: { id: noticeId },
      data: { status: NoticeStatus.ARCHIVED },
      include: {
        createdBy: { select: { displayName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        societyId: existing.societyId,
        actorUserId: user.id,
        action: 'notice.archive',
        entityType: 'notice',
        entityId: notice.id,
      },
    });

    return toNoticeDto(notice);
  }

  async deleteDraft(
    user: AuthenticatedUser,
    noticeId: string,
  ): Promise<{ id: string }> {
    const existing = await this.requireNotice(noticeId);
    await this.authorization.assertCanAdministerSociety(
      user,
      existing.societyId,
    );
    if (existing.status !== NoticeStatus.DRAFT) {
      throw new ConflictException({
        message: 'Only draft notices can be deleted',
        code: 'CONFLICT',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          societyId: existing.societyId,
          actorUserId: user.id,
          action: 'notice.delete',
          entityType: 'notice',
          entityId: existing.id,
        },
      });
      await tx.notice.delete({ where: { id: existing.id } });
    });

    return { id: existing.id };
  }

  async markRead(
    user: AuthenticatedUser,
    noticeId: string,
  ): Promise<{ noticeId: string; readAt: string }> {
    const notice = await this.requireNotice(noticeId);
    await this.assertCanAccessNotice(user, notice);

    if (notice.status !== NoticeStatus.PUBLISHED) {
      throw new ConflictException({
        message: 'Only published notices can be marked as read',
        code: 'CONFLICT',
      });
    }

    try {
      const read = await this.prisma.noticeRead.create({
        data: {
          noticeId: notice.id,
          userId: user.id,
        },
      });
      return {
        noticeId: notice.id,
        readAt: read.readAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.noticeRead.findUnique({
          where: {
            noticeId_userId: {
              noticeId: notice.id,
              userId: user.id,
            },
          },
        });
        if (!existing) {
          throw error;
        }
        return {
          noticeId: notice.id,
          readAt: existing.readAt.toISOString(),
        };
      }
      throw error;
    }
  }

  async getReadership(
    user: AuthenticatedUser,
    noticeId: string,
  ): Promise<NoticeReadershipDto> {
    const notice = await this.requireNotice(noticeId);
    await this.authorization.assertCanAdministerSociety(
      user,
      notice.societyId,
    );

    const eligibleUserIds = await this.findEligibleResidentUserIds(notice);
    const eligibleRecipients = eligibleUserIds.length;

    const readCount =
      eligibleRecipients === 0
        ? 0
        : await this.prisma.noticeRead.count({
            where: {
              noticeId: notice.id,
              userId: { in: eligibleUserIds },
            },
          });

    const unreadCount = Math.max(eligibleRecipients - readCount, 0);
    const readPercentage =
      eligibleRecipients === 0
        ? 0
        : Math.round((readCount / eligibleRecipients) * 1000) / 10;

    return {
      noticeId: notice.id,
      eligibleRecipients,
      readCount,
      unreadCount,
      readPercentage,
    };
  }

  private async requireNotice(noticeId: string) {
    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
    });
    if (!notice) {
      throw new NotFoundException({
        message: 'Notice not found',
        code: 'NOT_FOUND',
      });
    }
    return notice;
  }

  private async isSocietyAdmin(
    user: AuthenticatedUser,
    societyId: string,
    membershipRole?: MembershipRole,
  ): Promise<boolean> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      return true;
    }
    if (membershipRole === MembershipRole.SOCIETY_ADMIN) {
      return true;
    }
    const admin = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.SOCIETY_ADMIN,
      },
      select: { id: true },
    });
    return Boolean(admin);
  }

  private async buildListWhere(input: {
    societyId: string;
    isAdmin: boolean;
    userId: string;
    statusFilter?: NoticeStatus;
  }): Promise<Prisma.NoticeWhereInput> {
    if (input.isAdmin) {
      return {
        societyId: input.societyId,
        ...(input.statusFilter ? { status: input.statusFilter } : {}),
      };
    }

    if (
      input.statusFilter &&
      input.statusFilter !== NoticeStatus.PUBLISHED
    ) {
      throw new ForbiddenException({
        message: 'Residents can only list published notices',
        code: 'FORBIDDEN',
      });
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: input.userId,
        societyId: input.societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        primaryUnitId: true,
        primaryUnit: { select: { buildingId: true } },
      },
    });

    const buildingId = membership?.primaryUnit?.buildingId ?? null;
    const unitId = membership?.primaryUnitId ?? null;

    const audienceFilters: Prisma.NoticeWhereInput[] = [
      { audienceType: NoticeAudienceType.SOCIETY },
    ];
    if (buildingId) {
      audienceFilters.push({
        audienceType: NoticeAudienceType.BUILDING,
        targetBuildingId: buildingId,
      });
    }
    if (unitId) {
      audienceFilters.push({
        audienceType: NoticeAudienceType.UNIT,
        targetUnitId: unitId,
      });
    }

    return {
      societyId: input.societyId,
      status: NoticeStatus.PUBLISHED,
      OR: audienceFilters,
    };
  }

  private async assertCanAccessNotice(
    user: AuthenticatedUser,
    notice: {
      societyId: string;
      status: NoticeStatus;
      audienceType: NoticeAudienceType;
      targetBuildingId: string | null;
      targetUnitId: string | null;
    },
  ): Promise<void> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      notice.societyId,
    );
    const isAdmin = await this.isSocietyAdmin(
      user,
      notice.societyId,
      membership?.role,
    );

    if (isAdmin) {
      return;
    }

    if (notice.status !== NoticeStatus.PUBLISHED) {
      throw new NotFoundException({
        message: 'Notice not found',
        code: 'NOT_FOUND',
      });
    }

    const eligible = await this.isResidentInAudience(user.id, notice);
    if (!eligible) {
      throw new NotFoundException({
        message: 'Notice not found',
        code: 'NOT_FOUND',
      });
    }
  }

  private async isResidentInAudience(
    userId: string,
    notice: {
      societyId: string;
      audienceType: NoticeAudienceType;
      targetBuildingId: string | null;
      targetUnitId: string | null;
    },
  ): Promise<boolean> {
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId,
        societyId: notice.societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        primaryUnitId: true,
        primaryUnit: { select: { buildingId: true } },
      },
    });
    if (!membership) {
      return false;
    }

    if (notice.audienceType === NoticeAudienceType.SOCIETY) {
      return true;
    }
    if (notice.audienceType === NoticeAudienceType.BUILDING) {
      return (
        membership.primaryUnit?.buildingId === notice.targetBuildingId
      );
    }
    if (notice.audienceType === NoticeAudienceType.UNIT) {
      return membership.primaryUnitId === notice.targetUnitId;
    }
    return false;
  }

  private async findEligibleResidentUserIds(notice: {
    societyId: string;
    audienceType: NoticeAudienceType;
    targetBuildingId: string | null;
    targetUnitId: string | null;
  }): Promise<string[]> {
    const where: Prisma.SocietyMembershipWhereInput = {
      societyId: notice.societyId,
      status: MembershipStatus.ACTIVE,
      role: MembershipRole.RESIDENT_USER,
    };

    if (notice.audienceType === NoticeAudienceType.BUILDING) {
      where.primaryUnit = {
        buildingId: notice.targetBuildingId ?? undefined,
      };
    } else if (notice.audienceType === NoticeAudienceType.UNIT) {
      where.primaryUnitId = notice.targetUnitId;
    }

    const memberships = await this.prisma.societyMembership.findMany({
      where,
      select: { userId: true },
    });
    return memberships.map((membership) => membership.userId);
  }

  private async resolveAudience(
    societyId: string,
    input: {
      audienceType: NoticeAudienceType;
      targetBuildingId?: string | null;
      targetUnitId?: string | null;
    },
  ): Promise<AudienceTargets> {
    if (input.audienceType === NoticeAudienceType.SOCIETY) {
      if (input.targetBuildingId || input.targetUnitId) {
        throw new BadRequestException({
          message:
            'Society-wide notices must not target a building or unit',
          code: 'BAD_REQUEST',
        });
      }
      return {
        audienceType: NoticeAudienceType.SOCIETY,
        targetBuildingId: null,
        targetUnitId: null,
      };
    }

    if (input.audienceType === NoticeAudienceType.BUILDING) {
      if (!input.targetBuildingId) {
        throw new BadRequestException({
          message: 'Building audience requires targetBuildingId',
          code: 'BAD_REQUEST',
        });
      }
      if (input.targetUnitId) {
        throw new BadRequestException({
          message: 'Building audience must not include targetUnitId',
          code: 'BAD_REQUEST',
        });
      }
      const building = await this.prisma.building.findFirst({
        where: { id: input.targetBuildingId, societyId },
        select: { id: true },
      });
      if (!building) {
        throw new BadRequestException({
          message: 'Target building was not found in this society',
          code: 'BAD_REQUEST',
        });
      }
      return {
        audienceType: NoticeAudienceType.BUILDING,
        targetBuildingId: building.id,
        targetUnitId: null,
      };
    }

    if (input.audienceType === NoticeAudienceType.UNIT) {
      if (!input.targetUnitId) {
        throw new BadRequestException({
          message: 'Unit audience requires targetUnitId',
          code: 'BAD_REQUEST',
        });
      }
      const unit = await this.prisma.unit.findFirst({
        where: { id: input.targetUnitId, societyId },
        select: { id: true, buildingId: true },
      });
      if (!unit) {
        throw new BadRequestException({
          message: 'Target unit was not found in this society',
          code: 'BAD_REQUEST',
        });
      }
      if (
        input.targetBuildingId &&
        input.targetBuildingId !== unit.buildingId
      ) {
        throw new BadRequestException({
          message: 'Target unit does not belong to the specified building',
          code: 'BAD_REQUEST',
        });
      }
      return {
        audienceType: NoticeAudienceType.UNIT,
        targetBuildingId: unit.buildingId,
        targetUnitId: unit.id,
      };
    }

    throw new BadRequestException({
      message: 'Invalid audience type',
      code: 'BAD_REQUEST',
    });
  }
}
