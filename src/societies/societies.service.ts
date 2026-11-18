import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  SocietyStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSocietyDto } from './dto/create-society.dto.js';
import type { UpdateSocietyDto } from './dto/update-society.dto.js';
import {
  toSocietyDetail,
  toSocietyListItem,
  toSocietyResidentDetail,
  type SocietyDetailDto,
  type SocietyListItemDto,
  type SocietyResidentDetailDto,
} from './societies.mapper.js';

export type PaginatedSocieties = {
  items: SocietyListItemDto[];
  page: number;
  limit: number;
  total: number;
  activeCount: number;
  archivedCount: number;
};

@Injectable()
export class SocietiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreateSocietyDto,
  ): Promise<{
    society: SocietyDetailDto;
    initialAdminMembership: {
      id: string;
      societyId: string;
      userId: string;
      role: MembershipRole;
      status: MembershipStatus;
    };
  }> {
    const adminProfile = await this.prisma.userProfile.findUnique({
      where: { id: dto.initialAdminUserId },
      select: { id: true, displayName: true },
    });

    if (!adminProfile) {
      throw new BadRequestException({
        message: 'Initial society admin user was not found',
        code: 'BAD_REQUEST',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const society = await tx.society.create({
        data: {
          name: dto.name.trim(),
          addressLine1: optionalTrim(dto.addressLine1),
          addressLine2: optionalTrim(dto.addressLine2),
          city: optionalTrim(dto.city),
          state: optionalTrim(dto.state),
          postalCode: optionalTrim(dto.postalCode),
          status: SocietyStatus.ACTIVE,
        },
      });

      const membership = await tx.societyMembership.create({
        data: {
          societyId: society.id,
          userId: adminProfile.id,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
          societyId: true,
          userId: true,
          role: true,
          status: true,
        },
      });

      await tx.auditLog.create({
        data: {
          societyId: society.id,
          actorUserId: actor.id,
          action: 'society.create',
          entityType: 'society',
          entityId: society.id,
          metadata: {
            initialAdminUserId: adminProfile.id,
          },
        },
      });

      return { society, membership };
    });

    return {
      society: toSocietyDetail(result.society, null),
      initialAdminMembership: result.membership,
    };
  }

  async list(
    user: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<PaginatedSocieties> {
    const skip = (page - 1) * limit;

    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      const [total, activeCount, archivedCount, societies] =
        await this.prisma.$transaction([
          this.prisma.society.count(),
          this.prisma.society.count({
            where: { status: SocietyStatus.ACTIVE },
          }),
          this.prisma.society.count({
            where: { status: SocietyStatus.ARCHIVED },
          }),
          this.prisma.society.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

      return {
        items: societies.map((society) => toSocietyListItem(society, null)),
        page,
        limit,
        total,
        activeCount,
        archivedCount,
      };
    }

    const where = {
      memberships: {
        some: {
          userId: user.id,
          status: MembershipStatus.ACTIVE,
        },
      },
    };

    const [total, activeCount, archivedCount, societies] =
      await this.prisma.$transaction([
      this.prisma.society.count({ where }),
      this.prisma.society.count({
        where: { ...where, status: SocietyStatus.ACTIVE },
      }),
      this.prisma.society.count({
        where: { ...where, status: SocietyStatus.ARCHIVED },
      }),
      this.prisma.society.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          memberships: {
            where: {
              userId: user.id,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              role: true,
            },
            take: 1,
          },
        },
      }),
    ]);

    return {
      items: societies.map((society) =>
        toSocietyListItem(society, society.memberships[0]?.role ?? null),
      ),
      page,
      limit,
      total,
      activeCount,
      archivedCount,
    };
  }

  async getById(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<SocietyDetailDto | SocietyResidentDetailDto> {
    const society = await this.prisma.society.findUnique({
      where: { id: societyId },
    });

    if (!society) {
      throw new NotFoundException({
        message: 'Society not found',
        code: 'NOT_FOUND',
      });
    }

    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      return toSocietyDetail(society, null);
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        societyId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      // Hide existence from unauthorized callers (IDOR-safe).
      throw new NotFoundException({
        message: 'Society not found',
        code: 'NOT_FOUND',
      });
    }

    if (membership.role === MembershipRole.SOCIETY_ADMIN) {
      return toSocietyDetail(society, membership.role);
    }

    return toSocietyResidentDetail(society, membership.role);
  }

  async update(
    user: AuthenticatedUser,
    societyId: string,
    dto: UpdateSocietyDto,
  ): Promise<SocietyDetailDto> {
    await this.assertCanAdministerSociety(user, societyId);

    const data: {
      name?: string;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      status?: SocietyStatus;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.addressLine1 !== undefined) {
      data.addressLine1 = nullableTrim(dto.addressLine1);
    }
    if (dto.addressLine2 !== undefined) {
      data.addressLine2 = nullableTrim(dto.addressLine2);
    }
    if (dto.city !== undefined) {
      data.city = nullableTrim(dto.city);
    }
    if (dto.state !== undefined) {
      data.state = nullableTrim(dto.state);
    }
    if (dto.postalCode !== undefined) {
      data.postalCode = nullableTrim(dto.postalCode);
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        message: 'No updatable fields were provided',
        code: 'BAD_REQUEST',
      });
    }

    const society = await this.prisma.society.update({
      where: { id: societyId },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        societyId: society.id,
        actorUserId: user.id,
        action: 'society.update',
        entityType: 'society',
        entityId: society.id,
        metadata: data,
      },
    });

    const membershipRole =
      user.platformRole === PlatformRole.PLATFORM_OWNER
        ? null
        : MembershipRole.SOCIETY_ADMIN;

    return toSocietyDetail(society, membershipRole);
  }

  private async assertCanAdministerSociety(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      const exists = await this.prisma.society.findUnique({
        where: { id: societyId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException({
          message: 'Society not found',
          code: 'NOT_FOUND',
        });
      }
      return;
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        societyId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.SOCIETY_ADMIN,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException({
        message: 'You do not have permission to update this society',
        code: 'FORBIDDEN',
      });
    }
  }
}

function optionalTrim(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function nullableTrim(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
