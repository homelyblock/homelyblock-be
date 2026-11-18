import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { PlatformRole as PlatformRoleType } from './roles.js';

export type UserSearchScope =
  | { type: 'platform' }
  | { type: 'society'; societyId: string };

export type AuthorizedSocietyMembership = {
  id: string;
  societyId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
};

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  assertAuthenticated(user?: AuthenticatedUser): AuthenticatedUser {
    if (!user) {
      throw new UnauthorizedException({
        message: 'Authentication is required',
        code: 'UNAUTHORIZED',
      });
    }
    return user;
  }

  assertPlatformRoles(
    user: AuthenticatedUser,
    allowedRoles: PlatformRoleType[],
  ): void {
    if (allowedRoles.length === 0) {
      throw new ForbiddenException({
        message: 'No platform roles are configured for this route',
        code: 'FORBIDDEN',
      });
    }

    if (!user.platformRole || !allowedRoles.includes(user.platformRole)) {
      throw new ForbiddenException({
        message: 'You do not have permission to perform this action',
        code: 'FORBIDDEN',
      });
    }
  }

  async assertSocietyRoles(
    userId: string,
    societyId: string,
    allowedRoles: MembershipRole[],
  ): Promise<AuthorizedSocietyMembership> {
    if (!societyId || societyId.trim().length === 0) {
      throw new ForbiddenException({
        message: 'Society scope is required for this action',
        code: 'FORBIDDEN',
      });
    }

    if (allowedRoles.length === 0) {
      throw new ForbiddenException({
        message: 'No society roles are configured for this route',
        code: 'FORBIDDEN',
      });
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: {
          in: allowedRoles,
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
      throw new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      });
    }

    return membership;
  }

  async ensureSocietyExists(societyId: string): Promise<void> {
    const society = await this.prisma.society.findUnique({
      where: { id: societyId },
      select: { id: true },
    });
    if (!society) {
      throw new NotFoundException({
        message: 'Society not found',
        code: 'NOT_FOUND',
      });
    }
  }

  /**
   * Platform owners or ACTIVE SOCIETY_ADMIN of the target society.
   */
  async assertCanAdministerSociety(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.ensureSocietyExists(societyId);
      return;
    }

    await this.assertSocietyRoles(user.id, societyId, [
      MembershipRole.SOCIETY_ADMIN,
    ]);
  }

  /**
   * Platform owners or any ACTIVE society membership (admin or resident).
   */
  async assertCanViewSociety(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<AuthorizedSocietyMembership | null> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.ensureSocietyExists(societyId);
      return null;
    }

    return this.assertSocietyRoles(user.id, societyId, [
      MembershipRole.SOCIETY_ADMIN,
      MembershipRole.RESIDENT_USER,
    ]);
  }

  /**
   * Who may search profiles, and how wide that search may be.
   *
   * Platform owners may search every profile (needed to assign the first admin
   * before a society exists). When they pass societyId, the society must exist,
   * but results stay platform-wide.
   *
   * Society admins must pass the society they administer. Residents cannot search.
   * The caller is responsible for applying the returned scope to the query so
   * admins cannot enumerate profiles that belong only to other societies.
   */
  async resolveUserSearchScope(
    user: AuthenticatedUser,
    societyId?: string,
  ): Promise<UserSearchScope> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      if (societyId) {
        await this.ensureSocietyExists(societyId);
      }
      return { type: 'platform' };
    }

    if (!societyId) {
      const adminMembership = await this.prisma.societyMembership.findFirst({
        where: {
          userId: user.id,
          status: MembershipStatus.ACTIVE,
          role: MembershipRole.SOCIETY_ADMIN,
        },
        select: { id: true },
      });
      if (!adminMembership) {
        throw new ForbiddenException({
          message: 'You do not have permission to search users',
          code: 'FORBIDDEN',
        });
      }
      throw new BadRequestException({
        message: 'societyId is required to search users',
        code: 'BAD_REQUEST',
      });
    }

    await this.assertCanAdministerSociety(user, societyId);
    return { type: 'society', societyId };
  }

  /**
   * A society must keep at least one ACTIVE SOCIETY_ADMIN.
   *
   * Locks the society row first, then re-reads the membership, so two concurrent
   * demotions cannot both observe the other administrator as still active.
   * Invited, suspended, and removed administrators do not count.
   * Platform-owner authority does not replace this membership requirement.
   */
  async assertKeepsActiveSocietyAdmin(
    tx: Prisma.TransactionClient,
    societyId: string,
    membershipId: string,
    change: {
      role?: MembershipRole;
      status?: MembershipStatus;
    },
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT id FROM societies WHERE id = ${societyId}::uuid FOR UPDATE
    `;

    const current = await tx.societyMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        societyId: true,
        role: true,
        status: true,
      },
    });
    if (!current || current.societyId !== societyId) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'NOT_FOUND',
      });
    }

    const nextRole = change.role ?? current.role;
    const nextStatus = change.status ?? current.status;
    const isActiveAdmin =
      current.role === MembershipRole.SOCIETY_ADMIN &&
      current.status === MembershipStatus.ACTIVE;
    const remainsActiveAdmin =
      nextRole === MembershipRole.SOCIETY_ADMIN &&
      nextStatus === MembershipStatus.ACTIVE;
    if (!isActiveAdmin || remainsActiveAdmin) {
      return;
    }

    const otherActiveAdmins = await tx.societyMembership.count({
      where: {
        societyId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.ACTIVE,
        id: { not: membershipId },
      },
    });
    if (otherActiveAdmins < 1) {
      throw new ConflictException({
        message:
          'This society must keep at least one active society administrator.',
        code: 'CONFLICT',
      });
    }
  }
}
