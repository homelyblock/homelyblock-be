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
  UnitStatus,
  VisitorEntryType,
  VisitorStatus,
} from '../generated/prisma/client.js';
import { normalizeIndianPhone } from '../common/indian-phone.js';
import { parseExplicitInstant } from '../common/instant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateExpectedVisitorDto } from './dto/create-expected-visitor.dto.js';
import type { CreateWalkInVisitorDto } from './dto/create-walk-in-visitor.dto.js';
import type { ListVisitorsQueryDto } from './dto/list-visitors-query.dto.js';
import { toVisitorDto, type VisitorDto } from './visitors.mapper.js';

export type PaginatedVisitors = {
  items: VisitorDto[];
  page: number;
  limit: number;
  total: number;
};

const EXPIRABLE_STATUSES: VisitorStatus[] = [
  VisitorStatus.PENDING,
  VisitorStatus.APPROVED,
];

@Injectable()
export class VisitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async createExpected(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateExpectedVisitorDto,
  ): Promise<VisitorDto> {
    const membership = await this.requireActiveResidentMembership(
      user.id,
      societyId,
    );
    if (!membership.primaryUnitId || !membership.primaryUnit) {
      throw new BadRequestException({
        message: 'Active primary unit is required to register a visitor',
        code: 'BAD_REQUEST',
      });
    }
    if (membership.primaryUnit.status !== UnitStatus.ACTIVE) {
      throw new BadRequestException({
        message: 'Primary unit is not active',
        code: 'BAD_REQUEST',
      });
    }

    const expectedAt = parseExpectedAt(dto.expectedAt, { allowPast: false });

    const visitor = await this.prisma.visitor.create({
      data: {
        societyId,
        buildingId: membership.primaryUnit.buildingId,
        unitId: membership.primaryUnitId,
        visitorName: dto.visitorName.trim(),
        visitorPhone: normalizePhone(dto.visitorPhone),
        purpose: dto.purpose.trim(),
        expectedAt,
        vehicleNumber: optionalTrim(dto.vehicleNumber),
        notes: optionalTrim(dto.notes),
        entryType: VisitorEntryType.EXPECTED,
        status: VisitorStatus.PENDING,
        createdByUserId: user.id,
      },
      include: visitorIncludes,
    });

    await this.audit(user.id, societyId, 'visitor.create_expected', visitor.id, {
      unitId: visitor.unitId,
    });

    return toVisitorDto(visitor);
  }

  async createWalkIn(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateWalkInVisitorDto,
  ): Promise<VisitorDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, societyId },
      select: { id: true, buildingId: true, status: true },
    });
    if (!unit) {
      throw new BadRequestException({
        message: 'Unit was not found in this society',
        code: 'BAD_REQUEST',
      });
    }
    if (unit.status !== UnitStatus.ACTIVE) {
      throw new BadRequestException({
        message: 'Unit is not active',
        code: 'BAD_REQUEST',
      });
    }

    const expectedAt = dto.expectedAt
      ? parseExpectedAt(dto.expectedAt, { allowPast: true })
      : new Date(Date.now() + 4 * 60 * 60 * 1000);

    const visitor = await this.prisma.visitor.create({
      data: {
        societyId,
        buildingId: unit.buildingId,
        unitId: unit.id,
        visitorName: dto.visitorName.trim(),
        visitorPhone: normalizePhone(dto.visitorPhone),
        purpose: dto.purpose.trim(),
        expectedAt,
        vehicleNumber: optionalTrim(dto.vehicleNumber),
        notes: optionalTrim(dto.notes),
        entryType: VisitorEntryType.WALK_IN,
        status: VisitorStatus.PENDING,
        createdByUserId: user.id,
      },
      include: visitorIncludes,
    });

    await this.audit(user.id, societyId, 'visitor.create_walk_in', visitor.id, {
      unitId: visitor.unitId,
    });

    return toVisitorDto(visitor);
  }

  async list(
    user: AuthenticatedUser,
    societyId: string,
    query: ListVisitorsQueryDto,
  ): Promise<PaginatedVisitors> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin = await this.isSocietyAdmin(user, societyId, membership?.role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    await this.expireDueVisitors(societyId);

    const where: Prisma.VisitorWhereInput = {
      societyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            expectedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (isAdmin) {
      if (query.unitId) {
        where.unitId = query.unitId;
      }
    } else {
      const unitId = membership?.primaryUnitId;
      if (!unitId) {
        return { items: [], page, limit, total: 0 };
      }
      if (query.unitId && query.unitId !== unitId) {
        throw new ForbiddenException({
          message: 'You can only list visitors for your own unit',
          code: 'FORBIDDEN',
        });
      }
      where.unitId = unitId;
    }

    const [total, visitors] = await this.prisma.$transaction([
      this.prisma.visitor.count({ where }),
      this.prisma.visitor.findMany({
        where,
        orderBy: [{ expectedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: visitorIncludes,
      }),
    ]);

    return {
      items: visitors.map((visitor) =>
        toVisitorDto(visitor, { maskPhone: true }),
      ),
      page,
      limit,
      total,
    };
  }

  async getById(
    user: AuthenticatedUser,
    visitorId: string,
  ): Promise<VisitorDto> {
    const visitor = await this.requireVisitor(visitorId);
    await this.assertCanViewVisitor(user, visitor);
    const fresh = await this.expireIfDue(visitor);
    return toVisitorDto(fresh);
  }

  async approve(
    user: AuthenticatedUser,
    visitorId: string,
  ): Promise<VisitorDto> {
    return this.decide(user, visitorId, 'APPROVED');
  }

  async reject(
    user: AuthenticatedUser,
    visitorId: string,
  ): Promise<VisitorDto> {
    return this.decide(user, visitorId, 'REJECTED');
  }

  async cancel(
    user: AuthenticatedUser,
    visitorId: string,
  ): Promise<VisitorDto> {
    const visitor = await this.expireIfDue(await this.requireVisitor(visitorId));
    await this.assertCanCancel(user, visitor);

    if (
      visitor.status !== VisitorStatus.PENDING &&
      visitor.status !== VisitorStatus.APPROVED
    ) {
      throw new ConflictException({
        message: 'Only pending or approved visitors can be cancelled',
        code: 'CONFLICT',
      });
    }

    const updated = await this.commitVisitorStatus(
      visitor.id,
      [VisitorStatus.PENDING, VisitorStatus.APPROVED],
      { status: VisitorStatus.CANCELLED },
    );

    await this.audit(
      user.id,
      visitor.societyId,
      'visitor.cancel',
      visitor.id,
      { previousStatus: visitor.status },
    );

    return toVisitorDto(updated);
  }

  async checkIn(
    user: AuthenticatedUser,
    visitorId: string,
  ): Promise<VisitorDto> {
    const visitor = await this.expireIfDue(await this.requireVisitor(visitorId));
    await this.authorization.assertCanAdministerSociety(
      user,
      visitor.societyId,
    );

    if (visitor.status === VisitorStatus.CHECKED_IN) {
      throw new ConflictException({
        message: 'Visitor is already checked in',
        code: 'CONFLICT',
      });
    }
    if (visitor.status !== VisitorStatus.APPROVED) {
      throw new ConflictException({
        message: 'Only approved visitors can be checked in',
        code: 'CONFLICT',
      });
    }

    const updated = await this.commitVisitorStatus(
      visitor.id,
      VisitorStatus.APPROVED,
      {
        status: VisitorStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
    );

    await this.audit(
      user.id,
      visitor.societyId,
      'visitor.check_in',
      visitor.id,
    );

    return toVisitorDto(updated);
  }

  async checkOut(
    user: AuthenticatedUser,
    visitorId: string,
  ): Promise<VisitorDto> {
    const visitor = await this.requireVisitor(visitorId);
    await this.authorization.assertCanAdministerSociety(
      user,
      visitor.societyId,
    );

    if (visitor.status === VisitorStatus.CHECKED_OUT) {
      throw new ConflictException({
        message: 'Visitor is already checked out',
        code: 'CONFLICT',
      });
    }
    if (visitor.status !== VisitorStatus.CHECKED_IN) {
      throw new ConflictException({
        message: 'Visitor must be checked in before check-out',
        code: 'CONFLICT',
      });
    }

    const updated = await this.commitVisitorStatus(
      visitor.id,
      VisitorStatus.CHECKED_IN,
      {
        status: VisitorStatus.CHECKED_OUT,
        checkedOutAt: new Date(),
      },
    );

    await this.audit(
      user.id,
      visitor.societyId,
      'visitor.check_out',
      visitor.id,
    );

    return toVisitorDto(updated);
  }

  private async decide(
    user: AuthenticatedUser,
    visitorId: string,
    decision: 'APPROVED' | 'REJECTED',
  ): Promise<VisitorDto> {
    const visitor = await this.expireIfDue(await this.requireVisitor(visitorId));
    await this.assertCanDecide(user, visitor);

    if (visitor.status !== VisitorStatus.PENDING) {
      throw new ConflictException({
        message: 'Only pending visitors can be approved or rejected',
        code: 'CONFLICT',
      });
    }

    const updated = await this.commitVisitorStatus(
      visitor.id,
      VisitorStatus.PENDING,
      {
        status:
          decision === 'APPROVED'
            ? VisitorStatus.APPROVED
            : VisitorStatus.REJECTED,
        decisionByUserId: user.id,
        decisionAt: new Date(),
      },
    );

    await this.audit(
      user.id,
      visitor.societyId,
      decision === 'APPROVED' ? 'visitor.approve' : 'visitor.reject',
      visitor.id,
    );

    return toVisitorDto(updated);
  }

  private async requireActiveResidentMembership(
    userId: string,
    societyId: string,
  ) {
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT_USER,
      },
      select: {
        id: true,
        primaryUnitId: true,
        primaryUnit: {
          select: {
            id: true,
            buildingId: true,
            status: true,
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'Active resident membership is required',
        code: 'FORBIDDEN',
      });
    }
    return membership;
  }

  private async requireVisitor(visitorId: string) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: visitorIncludes,
    });
    if (!visitor) {
      throw new NotFoundException({
        message: 'Visitor not found',
        code: 'NOT_FOUND',
      });
    }
    return visitor;
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

  private async assertCanViewVisitor(
    user: AuthenticatedUser,
    visitor: { societyId: string; unitId: string },
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.authorization.ensureSocietyExists(visitor.societyId);
      return;
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: visitor.societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        role: true,
        primaryUnitId: true,
      },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Visitor not found',
        code: 'NOT_FOUND',
      });
    }
    if (membership.role === MembershipRole.SOCIETY_ADMIN) {
      return;
    }
    if (membership.primaryUnitId !== visitor.unitId) {
      throw new NotFoundException({
        message: 'Visitor not found',
        code: 'NOT_FOUND',
      });
    }
  }

  private async assertCanDecide(
    user: AuthenticatedUser,
    visitor: { societyId: string; unitId: string },
  ): Promise<void> {
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: visitor.societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT_USER,
        primaryUnitId: visitor.unitId,
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'Only the unit resident can approve or reject this visitor',
        code: 'FORBIDDEN',
      });
    }
  }

  private async assertCanCancel(
    user: AuthenticatedUser,
    visitor: {
      societyId: string;
      unitId: string;
      createdByUserId: string;
    },
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.authorization.ensureSocietyExists(visitor.societyId);
      return;
    }

    const admin = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: visitor.societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.SOCIETY_ADMIN,
      },
      select: { id: true },
    });
    if (admin) {
      return;
    }

    if (visitor.createdByUserId !== user.id) {
      throw new ForbiddenException({
        message: 'You can only cancel visitor requests you created',
        code: 'FORBIDDEN',
      });
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: visitor.societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT_USER,
        primaryUnitId: visitor.unitId,
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'You cannot cancel this visitor request',
        code: 'FORBIDDEN',
      });
    }
  }

  private async commitVisitorStatus(
    visitorId: string,
    expected: VisitorStatus | VisitorStatus[],
    data: Prisma.VisitorUncheckedUpdateManyInput,
  ) {
    const changed = await this.prisma.visitor.updateMany({
      where: {
        id: visitorId,
        status: Array.isArray(expected) ? { in: expected } : expected,
      },
      data,
    });
    if (changed.count !== 1) {
      throw new ConflictException({
        message: 'Visitor status changed. Refresh and try again.',
        code: 'CONFLICT',
      });
    }
    const updated = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: visitorIncludes,
    });
    if (!updated) {
      throw new NotFoundException({
        message: 'Visitor not found',
        code: 'NOT_FOUND',
      });
    }
    return updated;
  }

  private async expireDueVisitors(societyId: string): Promise<void> {
    await this.prisma.visitor.updateMany({
      where: {
        societyId,
        status: { in: EXPIRABLE_STATUSES },
        expectedAt: { lt: expirationCutoff() },
        checkedInAt: null,
      },
      data: { status: VisitorStatus.EXPIRED },
    });
  }

  private async expireIfDue<T extends {
    id: string;
    status: VisitorStatus;
    expectedAt: Date;
    checkedInAt: Date | null;
  }>(visitor: T): Promise<T> {
    if (
      EXPIRABLE_STATUSES.includes(visitor.status) &&
      visitor.checkedInAt === null &&
      visitor.expectedAt.getTime() < expirationCutoff().getTime()
    ) {
      const changed = await this.prisma.visitor.updateMany({
        where: {
          id: visitor.id,
          status: visitor.status,
          checkedInAt: null,
        },
        data: { status: VisitorStatus.EXPIRED },
      });
      if (changed.count !== 1) return visitor;
      const updated = await this.prisma.visitor.findUnique({
        where: { id: visitor.id },
        include: visitorIncludes,
      });
      return (updated ?? visitor) as unknown as T;
    }
    return visitor;
  }

  private async audit(
    actorUserId: string,
    societyId: string,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        societyId,
        actorUserId,
        action,
        entityType: 'visitor',
        entityId,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }
}

const visitorIncludes = {
  unit: { select: { unitNumber: true } },
  building: { select: { code: true } },
} as const;

function optionalTrim(value?: string): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(value: string): string {
  return normalizeIndianPhone(value);
}

function parseExpectedAt(
  value: string,
  options: { allowPast: boolean },
): Date {
  const date = parseExplicitInstant(value, 'expectedAt');
  if (!options.allowPast && date.getTime() < Date.now() - 60_000) {
    throw new BadRequestException({
      message: 'expectedAt must be in the future',
      code: 'BAD_REQUEST',
    });
  }
  return date;
}

/** Expire only after expected time plus a short grace window. */
function expirationCutoff(): Date {
  return new Date(Date.now() - 5 * 60 * 1000);
}
