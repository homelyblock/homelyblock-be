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
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMembershipDto } from './dto/create-membership.dto.js';
import type { UpdateMembershipDto } from './dto/update-membership.dto.js';

const ALLOWED_MEMBERSHIP_ROLES: MembershipRole[] = [
  MembershipRole.SOCIETY_ADMIN,
  MembershipRole.RESIDENT_USER,
];

export type MembershipListItemDto = {
  id: string;
  societyId: string;
  userId: string;
  displayName: string;
  email?: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipDto = {
  id: string;
  societyId: string;
  userId: string;
  displayName: string;
  email: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<MembershipListItemDto[]> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    const memberships = await this.prisma.societyMembership.findMany({
      where: { societyId },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        societyId: true,
        userId: true,
        role: true,
        status: true,
        primaryUnitId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    });

    return memberships.map((membership) => {
      const item: MembershipListItemDto = {
        id: membership.id,
        societyId: membership.societyId,
        userId: membership.userId,
        displayName: membership.user.displayName,
        role: membership.role,
        status: membership.status,
        primaryUnitId: membership.primaryUnitId,
        email: membership.user.email,
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };
      return item;
    });
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

    try {
      const membership = await this.prisma.societyMembership.create({
        data: {
          societyId,
          userId: profile.id,
          role: dto.role,
          status: MembershipStatus.INVITED,
          ...(primaryUnitId !== undefined ? { primaryUnitId } : {}),
        },
        include: {
          user: {
            select: { displayName: true, email: true },
          },
        },
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
      select: {
        id: true,
        societyId: true,
      },
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
    if (dto.status !== undefined) {
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

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        message: 'No updatable fields were provided',
        code: 'BAD_REQUEST',
      });
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      await this.authorization.assertKeepsActiveSocietyAdmin(
        tx,
        existing.societyId,
        membershipId,
        { role: dto.role, status: dto.status },
      );

      const updated = await tx.societyMembership.update({
        where: { id: membershipId },
        data,
        include: {
          user: {
            select: { displayName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          societyId: existing.societyId,
          actorUserId: user.id,
          action: 'membership.update',
          entityType: 'society_membership',
          entityId: updated.id,
          metadata: data,
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

function toMembershipDto(membership: {
  id: string;
  societyId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { displayName: string; email: string | null };
}): MembershipDto {
  return {
    id: membership.id,
    societyId: membership.societyId,
    userId: membership.userId,
    displayName: membership.user.displayName,
    email: membership.user.email,
    role: membership.role,
    status: membership.status,
    primaryUnitId: membership.primaryUnitId,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
