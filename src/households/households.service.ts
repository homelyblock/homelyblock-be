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
  PlatformRole,
  Prisma,
} from '../generated/prisma/client.js';
import { normalizeIndianPhone } from '../common/indian-phone.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateAdminHouseholdMemberDto,
  CreateOwnHouseholdMemberDto,
} from './dto/create-household-member.dto.js';
import type { ListSocietyHouseholdsQueryDto } from './dto/list-households-query.dto.js';
import type { UpdateHouseholdMemberDto } from './dto/update-household-member.dto.js';
import {
  toHouseholdMemberDto,
  type HouseholdMemberDto,
  type HouseholdOccupancyDto,
} from './households.mapper.js';

type MembershipContext = {
  id: string;
  societyId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
};

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listOwn(
    user: AuthenticatedUser,
    societyId: string,
    activeOnly = true,
  ): Promise<{
    membershipId: string;
    societyId: string;
    primaryUnitId: string | null;
    items: HouseholdMemberDto[];
  }> {
    const membership = await this.requireOwnActiveMembership(user.id, societyId);
    const items = await this.prisma.householdMember.findMany({
      where: {
        membershipId: membership.id,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      membershipId: membership.id,
      societyId: membership.societyId,
      primaryUnitId: membership.primaryUnitId,
      items: items.map((row) => toHouseholdMemberDto(row, membership.societyId)),
    };
  }

  async createOwn(
    user: AuthenticatedUser,
    dto: CreateOwnHouseholdMemberDto,
  ): Promise<HouseholdMemberDto> {
    const membership = await this.requireOwnActiveMembership(
      user.id,
      dto.societyId,
    );
    return this.createForMembership(user, membership, dto);
  }

  async createAsAdmin(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateAdminHouseholdMemberDto,
  ): Promise<HouseholdMemberDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        id: dto.membershipId,
        societyId,
        status: {
          in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED],
        },
      },
      select: {
        id: true,
        societyId: true,
        userId: true,
        role: true,
        status: true,
        primaryUnitId: true,
      },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'NOT_FOUND',
      });
    }
    return this.createForMembership(user, membership, dto);
  }

  async update(
    user: AuthenticatedUser,
    memberId: string,
    dto: UpdateHouseholdMemberDto,
  ): Promise<HouseholdMemberDto> {
    const existing = await this.loadMemberOrThrow(memberId);
    await this.assertCanManageMembership(user, existing.membership);

    if (
      dto.name === undefined &&
      dto.relationship === undefined &&
      dto.phone === undefined &&
      dto.email === undefined
    ) {
      throw new BadRequestException({
        message: 'Provide at least one field to update',
        code: 'BAD_REQUEST',
      });
    }

    const nextName = dto.name?.trim() ?? existing.name;
    if (dto.name !== undefined) {
      await this.assertNoDuplicateName(
        existing.membershipId,
        nextName,
        existing.id,
      );
    }

    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.householdMember.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: nextName } : {}),
          activeNameKey: existing.isActive
            ? householdActiveKey(existing.membershipId, nextName)
            : null,
          ...(dto.relationship !== undefined
            ? { relationship: dto.relationship }
            : {}),
          ...(dto.phone !== undefined
            ? {
                phone:
                  dto.phone === null || dto.phone.trim() === ''
                    ? null
                    : normalizePhone(dto.phone),
              }
            : {}),
          ...(dto.email !== undefined
            ? {
                email:
                  dto.email === null || dto.email.trim() === ''
                    ? null
                    : dto.email.trim().toLowerCase(),
              }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          societyId: existing.membership.societyId,
          actorUserId: user.id,
          action: 'household_member.update',
          entityType: 'household_member',
          entityId: row.id,
          metadata: { membershipId: existing.membershipId },
        },
      });
      return row;
    });
    } catch (error) {
      rethrowHouseholdConflict(error);
    }

    return toHouseholdMemberDto(updated, existing.membership.societyId);
  }

  async deactivate(
    user: AuthenticatedUser,
    memberId: string,
  ): Promise<HouseholdMemberDto> {
    const existing = await this.loadMemberOrThrow(memberId);
    await this.assertCanManageMembership(user, existing.membership);

    if (!existing.isActive) {
      return toHouseholdMemberDto(existing, existing.membership.societyId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.householdMember.update({
        where: { id: existing.id },
        data: { isActive: false, activeNameKey: null },
      });
      await tx.auditLog.create({
        data: {
          societyId: existing.membership.societyId,
          actorUserId: user.id,
          action: 'household_member.deactivate',
          entityType: 'household_member',
          entityId: row.id,
          metadata: { membershipId: existing.membershipId },
        },
      });
      return row;
    });

    return toHouseholdMemberDto(updated, existing.membership.societyId);
  }

  async listSocietyHouseholds(
    user: AuthenticatedUser,
    societyId: string,
    query: ListSocietyHouseholdsQueryDto,
  ): Promise<{
    items: HouseholdOccupancyDto[];
    page: number;
    limit: number;
    total: number;
  }> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const q = query.q?.trim();

    const where: Prisma.SocietyMembershipWhereInput = {
      societyId,
      status: {
        in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED],
      },
      ...(q
        ? {
            user: {
              OR: [
                { displayName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [total, memberships] = await this.prisma.$transaction([
      this.prisma.societyMembership.count({ where }),
      this.prisma.societyMembership.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          societyId: true,
          userId: true,
          role: true,
          status: true,
          primaryUnitId: true,
          user: {
            select: { displayName: true, email: true },
          },
          primaryUnit: {
            select: {
              unitNumber: true,
              building: { select: { name: true } },
            },
          },
          householdMembers: {
            where: { isActive: true },
            orderBy: [{ name: 'asc' }],
          },
        },
      }),
    ]);

    return {
      items: memberships.map((membership) =>
        toOccupancyDto(membership, membership.householdMembers),
      ),
      page,
      limit,
      total,
    };
  }

  async getUnitHousehold(
    user: AuthenticatedUser,
    societyId: string,
    unitId: string,
  ): Promise<{
    unitId: string;
    societyId: string;
    unitNumber: string;
    buildingName: string;
    items: HouseholdOccupancyDto[];
  }> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, societyId },
      select: {
        id: true,
        unitNumber: true,
        building: { select: { name: true } },
      },
    });
    if (!unit) {
      throw new NotFoundException({
        message: 'Unit not found',
        code: 'NOT_FOUND',
      });
    }

    const memberships = await this.prisma.societyMembership.findMany({
      where: {
        societyId,
        primaryUnitId: unitId,
        status: {
          in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        societyId: true,
        userId: true,
        role: true,
        status: true,
        primaryUnitId: true,
        user: {
          select: { displayName: true, email: true },
        },
        primaryUnit: {
          select: {
            unitNumber: true,
            building: { select: { name: true } },
          },
        },
        householdMembers: {
          where: { isActive: true },
          orderBy: [{ name: 'asc' }],
        },
      },
    });

    return {
      unitId: unit.id,
      societyId,
      unitNumber: unit.unitNumber,
      buildingName: unit.building.name,
      items: memberships.map((membership) =>
        toOccupancyDto(membership, membership.householdMembers),
      ),
    };
  }

  private async createForMembership(
    user: AuthenticatedUser,
    membership: MembershipContext,
    dto: {
      name: string;
      relationship: CreateOwnHouseholdMemberDto['relationship'];
      phone?: string;
      email?: string;
    },
  ): Promise<HouseholdMemberDto> {
    const name = dto.name.trim();
    await this.assertNoDuplicateName(membership.id, name);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.householdMember.create({
        data: {
          membershipId: membership.id,
          name,
          activeNameKey: householdActiveKey(membership.id, name),
          relationship: dto.relationship,
          phone: dto.phone ? normalizePhone(dto.phone) : null,
          email: dto.email ? dto.email.trim().toLowerCase() : null,
          createdByUserId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          societyId: membership.societyId,
          actorUserId: user.id,
          action: 'household_member.create',
          entityType: 'household_member',
          entityId: row.id,
          metadata: {
            membershipId: membership.id,
            primaryUnitId: membership.primaryUnitId,
          },
        },
      });
      return row;
    });
    } catch (error) {
      rethrowHouseholdConflict(error);
    }

    return toHouseholdMemberDto(created, membership.societyId);
  }

  private async requireOwnActiveMembership(
    userId: string,
    societyId: string,
  ): Promise<MembershipContext> {
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId,
        societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        id: true,
        societyId: true,
        userId: true,
        role: true,
        status: true,
        primaryUnitId: true,
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'You do not have an active membership in this society',
        code: 'FORBIDDEN',
      });
    }
    return membership;
  }

  private async assertCanManageMembership(
    user: AuthenticatedUser,
    membership: MembershipContext,
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.authorization.ensureSocietyExists(membership.societyId);
      return;
    }

    if (membership.userId === user.id) {
      if (membership.status !== MembershipStatus.ACTIVE) {
        throw new ForbiddenException({
          message: 'Your membership is not active',
          code: 'FORBIDDEN',
        });
      }
      return;
    }

    await this.authorization.assertCanAdministerSociety(
      user,
      membership.societyId,
    );
  }

  private async loadMemberOrThrow(memberId: string) {
    const row = await this.prisma.householdMember.findUnique({
      where: { id: memberId },
      include: {
        membership: {
          select: {
            id: true,
            societyId: true,
            userId: true,
            role: true,
            status: true,
            primaryUnitId: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Household member not found',
        code: 'NOT_FOUND',
      });
    }
    return row;
  }

  private async assertNoDuplicateName(
    membershipId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.householdMember.findFirst({
      where: {
        membershipId,
        isActive: true,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message:
          'An active household member with this name already exists for this household',
        code: 'CONFLICT',
      });
    }
  }
}

function normalizePhone(value: string): string {
  return normalizeIndianPhone(value);
}

function householdActiveKey(membershipId: string, name: string): string {
  return `${membershipId}:${name.trim().toLowerCase()}`;
}

function rethrowHouseholdConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException({
      message:
        'An active household member with this name already exists for this household',
      code: 'CONFLICT',
    });
  }
  throw error;
}

function toOccupancyDto(
  membership: {
    id: string;
    societyId: string;
    userId: string;
    role: MembershipRole;
    status: MembershipStatus;
    primaryUnitId: string | null;
    user: { displayName: string; email: string | null };
    primaryUnit: {
      unitNumber: string;
      building: { name: string };
    } | null;
  },
  householdMembers: Parameters<typeof toHouseholdMemberDto>[0][],
): HouseholdOccupancyDto {
  return {
    membershipId: membership.id,
    societyId: membership.societyId,
    userId: membership.userId,
    displayName: membership.user.displayName,
    email: membership.user.email,
    role: membership.role,
    status: membership.status,
    primaryUnitId: membership.primaryUnitId,
    primaryUnitNumber: membership.primaryUnit?.unitNumber ?? null,
    buildingName: membership.primaryUnit?.building.name ?? null,
    activeHouseholdCount: householdMembers.length,
    householdMembers: householdMembers.map((row) =>
      toHouseholdMemberDto(row, membership.societyId),
    ),
  };
}
