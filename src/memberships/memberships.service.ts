import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  Prisma,
} from '../generated/prisma/client.js';
import {
  pageWindow,
  searchTerm,
  type PageResult,
} from '../common/dto/page-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMembershipDto } from './dto/create-membership.dto.js';
import type { ListMembershipsQueryDto } from './dto/list-memberships-query.dto.js';
import type { UpdateMembershipDto } from './dto/update-membership.dto.js';
import {
  invitationExpiry,
  invitationState,
  invitationTtlDays,
  invitationTtlMs,
  isInvitationExpired,
  type InvitationState,
} from './invitation-policy.js';

const ALLOWED_MEMBERSHIP_ROLES: MembershipRole[] = [
  MembershipRole.SOCIETY_ADMIN,
  MembershipRole.RESIDENT_USER,
];

const membershipSelect = {
  id: true,
  societyId: true,
  userId: true,
  role: true,
  status: true,
  primaryUnitId: true,
  invitedAt: true,
  invitationExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      displayName: true,
      email: true,
    },
  },
} satisfies Prisma.SocietyMembershipSelect;

type MembershipRecord = Prisma.SocietyMembershipGetPayload<{
  select: typeof membershipSelect;
}>;

export type MembershipListItemDto = {
  id: string;
  societyId: string;
  userId: string;
  displayName: string;
  email?: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
  invitedAt: string | null;
  invitationExpiresAt: string | null;
  invitationState: InvitationState;
  createdAt: string;
  updatedAt: string;
};

export type MembershipDto = MembershipListItemDto;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(
    user: AuthenticatedUser,
    societyId: string,
    query: ListMembershipsQueryDto = {},
  ): Promise<PageResult<MembershipListItemDto> & { invitationTtlDays: number }> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const { page, limit, skip } = pageWindow(query);
    const term = searchTerm(query.q);
    const where: Prisma.SocietyMembershipWhereInput = {
      societyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(term
        ? {
            user: {
              OR: [
                { displayName: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [total, memberships] = await Promise.all([
      this.prisma.societyMembership.count({ where }),
      this.prisma.societyMembership.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
        select: membershipSelect,
      }),
    ]);

    return {
      items: memberships.map((membership) => toMembershipDto(membership)),
      page,
      limit,
      total,
      invitationTtlDays: invitationTtlDays(process.env.INVITATION_TTL_DAYS),
    };
  }

  async create(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateMembershipDto,
  ): Promise<MembershipDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    assertAllowedMembershipRole(dto.role);
    if (dto.status !== undefined && dto.status !== MembershipStatus.INVITED) {
      throw new BadRequestException({
        message:
          'New memberships start as invited. Activate the membership after it is created.',
        code: 'BAD_REQUEST',
      });
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { id: dto.userId },
      select: { id: true, displayName: true, email: true },
    });
    if (!profile) {
      throw new BadRequestException({
        message: 'User profile was not found',
        code: 'BAD_REQUEST',
      });
    }

    const primaryUnitId =
      dto.primaryUnitId !== undefined
        ? await this.resolvePrimaryUnitId(societyId, dto.primaryUnitId)
        : undefined;

    const now = new Date();
    try {
      const membership = await this.prisma.societyMembership.create({
        data: {
          societyId,
          userId: profile.id,
          role: dto.role,
          status: MembershipStatus.INVITED,
          invitedAt: now,
          invitationExpiresAt: invitationExpiry(now, invitationTtlMs()),
          ...(primaryUnitId !== undefined ? { primaryUnitId } : {}),
        },
        select: membershipSelect,
      });

      await this.prisma.auditLog.create({
        data: {
          societyId,
          actorUserId: user.id,
          action: 'membership.create',
          entityType: 'society_membership',
          entityId: membership.id,
          metadata: {
            userId: membership.userId,
            role: membership.role,
            status: membership.status,
          },
        },
      });

      return toMembershipDto(membership);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.societyMembership.findUnique({
          where: {
            societyId_userId: { societyId, userId: profile.id },
          },
          select: membershipSelect,
        });
        if (
          existing &&
          (existing.status === MembershipStatus.REMOVED ||
            isInvitationExpired(existing))
        ) {
          return this.reissue(user, existing, {
            role: dto.role,
            primaryUnitId: primaryUnitId ?? existing.primaryUnitId,
          });
        }
        throw new ConflictException({
          message: 'User already has a membership in this society',
          code: 'CONFLICT',
        });
      }
      throw error;
    }
  }

  async update(
    user: AuthenticatedUser,
    membershipId: string,
    dto: UpdateMembershipDto,
  ): Promise<MembershipDto> {
    const existing = await this.prisma.societyMembership.findUnique({
      where: { id: membershipId },
      select: membershipSelect,
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'NOT_FOUND',
      });
    }

    await this.authorization.assertCanAdministerSociety(
      user,
      existing.societyId,
    );

    if (dto.reissue) {
      if (
        existing.status === MembershipStatus.ACTIVE ||
        existing.status === MembershipStatus.SUSPENDED
      ) {
        throw new ConflictException({
          message:
            'Active memberships are not reissued. Remove the membership before sending a new invitation.',
          code: 'CONFLICT',
        });
      }
      if (dto.status !== undefined && dto.status !== MembershipStatus.INVITED) {
        throw new BadRequestException({
          message: 'Reissuing an invitation keeps the membership invited',
          code: 'BAD_REQUEST',
        });
      }
    }

    if (dto.role !== undefined) {
      assertAllowedMembershipRole(dto.role);
    }

    const data: {
      role?: MembershipRole;
      status?: MembershipStatus;
      primaryUnitId?: string | null;
    } = {};

    if (dto.role !== undefined) {
      data.role = dto.role;
    }
    if (dto.status !== undefined && !dto.reissue) {
      data.status = dto.status;
    }
    if (dto.primaryUnitId !== undefined) {
      data.primaryUnitId =
        dto.primaryUnitId === null
          ? null
          : await this.resolvePrimaryUnitId(
              existing.societyId,
              dto.primaryUnitId,
            );
    }

    if (dto.reissue) {
      return this.reissue(user, existing, {
        role: data.role ?? existing.role,
        primaryUnitId:
          data.primaryUnitId !== undefined
            ? data.primaryUnitId
            : existing.primaryUnitId,
      });
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        message: 'No updatable fields were provided',
        code: 'BAD_REQUEST',
      });
    }

    const activating =
      data.status === MembershipStatus.ACTIVE &&
      existing.status === MembershipStatus.INVITED;
    const revokingInvite =
      data.status === MembershipStatus.REMOVED &&
      existing.status === MembershipStatus.INVITED;

    const membership = await this.prisma.$transaction(async (tx) => {
      await this.authorization.assertKeepsActiveSocietyAdmin(
        tx,
        existing.societyId,
        membershipId,
        { role: data.role, status: data.status },
      );

      const action = activating
        ? 'membership.activate'
        : revokingInvite
          ? 'membership.revoke'
          : 'membership.update';

      if (activating) {
        const changed = await tx.societyMembership.updateMany({
          where: {
            id: membershipId,
            status: MembershipStatus.INVITED,
            invitationExpiresAt: { gt: new Date() },
          },
          data,
        });
        if (changed.count !== 1) {
          const current = await tx.societyMembership.findUnique({
            where: { id: membershipId },
            select: { status: true, invitationExpiresAt: true },
          });
          if (current && isInvitationExpired(current)) {
            throw new ConflictException({
              message:
                'This invitation has expired. Reissue it before activating the membership.',
              code: 'INVITATION_EXPIRED',
            });
          }
          throw new ConflictException({
            message: 'Invitation is no longer pending',
            code: 'CONFLICT',
          });
        }
      } else if (revokingInvite) {
        const changed = await tx.societyMembership.updateMany({
          where: { id: membershipId, status: MembershipStatus.INVITED },
          data: { ...data, invitationExpiresAt: new Date() },
        });
        if (changed.count !== 1) {
          throw new ConflictException({
            message: 'Invitation is no longer pending',
            code: 'CONFLICT',
          });
        }
      } else {
        const updated = await tx.societyMembership.update({
          where: { id: membershipId },
          data,
          select: membershipSelect,
        });
        await tx.auditLog.create({
          data: {
            societyId: existing.societyId,
            actorUserId: user.id,
            action,
            entityType: 'society_membership',
            entityId: updated.id,
            metadata: data,
          },
        });
        return updated;
      }

      const updated = await tx.societyMembership.findUniqueOrThrow({
        where: { id: membershipId },
        select: membershipSelect,
      });
      await tx.auditLog.create({
        data: {
          societyId: existing.societyId,
          actorUserId: user.id,
          action,
          entityType: 'society_membership',
          entityId: updated.id,
          metadata: data,
        },
      });
      return updated;
    });

    return toMembershipDto(membership);
  }

  private async reissue(
    user: AuthenticatedUser,
    existing: MembershipRecord,
    change: { role: MembershipRole; primaryUnitId: string | null },
  ): Promise<MembershipDto> {
    const now = new Date();
    const invitationExpiresAt = invitationExpiry(now, invitationTtlMs());
    const membership = await this.prisma.$transaction(async (tx) => {
      await this.authorization.assertKeepsActiveSocietyAdmin(
        tx,
        existing.societyId,
        existing.id,
        { role: change.role, status: MembershipStatus.INVITED },
      );
      const changed = await tx.societyMembership.updateMany({
        where: {
          id: existing.id,
          status: { in: [MembershipStatus.INVITED, MembershipStatus.REMOVED] },
        },
        data: {
          role: change.role,
          status: MembershipStatus.INVITED,
          primaryUnitId: change.primaryUnitId,
          invitedAt: now,
          invitationExpiresAt,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          message: 'Invitation could not be reissued',
          code: 'CONFLICT',
        });
      }
      const updated = await tx.societyMembership.findUniqueOrThrow({
        where: { id: existing.id },
        select: membershipSelect,
      });
      await tx.auditLog.create({
        data: {
          societyId: existing.societyId,
          actorUserId: user.id,
          action: 'membership.reissue',
          entityType: 'society_membership',
          entityId: updated.id,
          metadata: {
            role: change.role,
            invitationExpiresAt: invitationExpiresAt.toISOString(),
          },
        },
      });
      return updated;
    });
    return toMembershipDto(membership);
  }

  private async resolvePrimaryUnitId(
    societyId: string,
    unitId: string,
  ): Promise<string> {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, societyId },
      select: { id: true },
    });
    if (!unit) {
      throw new BadRequestException({
        message: 'Primary unit was not found in this society',
        code: 'BAD_REQUEST',
      });
    }
    return unit.id;
  }
}

function assertAllowedMembershipRole(role: MembershipRole): void {
  if (!ALLOWED_MEMBERSHIP_ROLES.includes(role)) {
    throw new BadRequestException({
      message: 'Invalid membership role',
      code: 'BAD_REQUEST',
    });
  }
}

function toMembershipDto(membership: MembershipRecord): MembershipDto {
  return {
    id: membership.id,
    societyId: membership.societyId,
    userId: membership.userId,
    displayName: membership.user.displayName,
    email: membership.user.email,
    role: membership.role,
    status: membership.status,
    primaryUnitId: membership.primaryUnitId,
    invitedAt: membership.invitedAt?.toISOString() ?? null,
    invitationExpiresAt: membership.invitationExpiresAt?.toISOString() ?? null,
    invitationState: invitationState({
      status: membership.status,
      invitationExpiresAt: membership.invitationExpiresAt,
    }),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
