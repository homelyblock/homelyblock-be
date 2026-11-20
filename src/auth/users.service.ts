import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  SocietyStatus,
} from '../generated/prisma/client.js';
import { normalizeIndianPhone } from '../common/indian-phone.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser, VerifiedAccessToken } from './auth.types.js';
import type { RecordSignupIntentDto } from './dto/record-signup-intent.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

export type UserSearchScope =
  | { type: 'platform' }
  | { type: 'society'; societyId: string };

export type UserSearchResult = {
  id: string;
  displayName: string;
  email: string | null;
};

export type ProfileWithMemberships = Awaited<
  ReturnType<UsersService['getProfileWithMemberships']>
>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProfile(
    identity: VerifiedAccessToken,
  ): Promise<AuthenticatedUser> {
    const email = normalizeEmail(identity.email);
    const existing = await this.prisma.userProfile.findUnique({
      where: { id: identity.sub },
      select: profileIdentitySelect,
    });

    if (existing) {
      if (
        email &&
        existing.email?.toLowerCase() !== email &&
        !(await this.emailTakenBySomeoneElse(email, identity.sub))
      ) {
        const updated = await this.prisma.userProfile.update({
          where: { id: identity.sub },
          data: { email },
          select: profileIdentitySelect,
        });
        return toAuthenticatedUser(updated, identity);
      }
      return toAuthenticatedUser(existing, identity);
    }

    const byEmail = email ? await this.findProfileByEmail(email) : null;
    if (byEmail) {
      // A recreated auth user may keep memberships only when the token proves
      // the address is verified. An unverified signup must not become that user.
      if (!identity.emailVerified) {
        throw emailAlreadyRegistered();
      }
      return toAuthenticatedUser(byEmail, identity);
    }

    try {
      const created = await this.prisma.userProfile.create({
        data: {
          id: identity.sub,
          displayName: identity.displayName,
          email,
        },
        select: profileIdentitySelect,
      });
      return toAuthenticatedUser(created, identity);
    } catch (error) {
      if (!isUniqueViolation(error) || !email) {
        throw error;
      }
      if (!identity.emailVerified) {
        throw emailAlreadyRegistered();
      }
      const raced = await this.findProfileByEmail(email);
      if (!raced) {
        throw error;
      }
      return toAuthenticatedUser(raced, identity);
    }
  }

  private async emailTakenBySomeoneElse(
    email: string,
    userId: string,
  ): Promise<boolean> {
    const owner = await this.prisma.userProfile.findFirst({
      where: {
        id: { not: userId },
        email: { equals: email, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return owner !== null;
  }

  private findProfileByEmail(email: string) {
    return this.prisma.userProfile.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
      select: profileIdentitySelect,
    });
  }

  async searchProfiles(
    query: string,
    limit: number,
    scope: UserSearchScope,
  ): Promise<UserSearchResult[]> {
    const normalized = query.trim();
    if (normalized.length < 2) {
      return [];
    }

    const textMatch = {
      OR: [
        {
          displayName: {
            contains: normalized,
            mode: 'insensitive' as const,
          },
        },
        {
          email: {
            contains: normalized,
            mode: 'insensitive' as const,
          },
        },
      ],
    };
    const unaffiliatedEmail = exactEmailQuery(normalized);
    const where =
      scope.type === 'platform'
        ? textMatch
        : {
            OR: [
              {
                AND: [
                  textMatch,
                  {
                    memberships: {
                      some: {
                        societyId: scope.societyId,
                        status: {
                          in: [
                            MembershipStatus.INVITED,
                            MembershipStatus.ACTIVE,
                          ],
                        },
                      },
                    },
                  },
                ],
              },
              ...(unaffiliatedEmail
                ? [
                    {
                      AND: [
                        {
                          email: {
                            equals: unaffiliatedEmail,
                            mode: 'insensitive' as const,
                          },
                        },
                        { memberships: { none: {} } },
                      ],
                    },
                  ]
                : []),
            ],
          };

    return this.prisma.userProfile.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        email: true,
      },
      orderBy: {
        displayName: 'asc',
      },
      take: Math.min(Math.max(Math.trunc(limit) || 1, 1), 20),
    });
  }

  async getProfileWithMemberships(userId: string) {
    return this.prisma.userProfile.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        platformRole: true,
        accountType: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: {
            status: {
              in: ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'],
            },
          },
          select: {
            id: true,
            role: true,
            status: true,
            societyId: true,
            primaryUnitId: true,
            society: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  /**
   * Self-service profile update. Email, platformRole, accountType, memberships,
   * and units are never writable here.
   */
  async updateOwnProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileWithMemberships> {
    if (dto.displayName === undefined && dto.phone === undefined) {
      throw new BadRequestException({
        message: 'Provide displayName and/or phone to update',
        code: 'BAD_REQUEST',
      });
    }

    const data: { displayName?: string; phone?: string | null } = {};
    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName.trim();
    }
    if (dto.phone !== undefined) {
      data.phone =
        dto.phone === null || dto.phone.trim() === ''
          ? null
          : normalizePhone(dto.phone);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.update({
        where: { id: userId },
        data,
      });
      await tx.auditLog.create({
        data: {
          societyId: null,
          actorUserId: userId,
          action: 'profile.update',
          entityType: 'user_profile',
          entityId: userId,
          metadata: {
            fields: Object.keys(data),
          },
        },
      });
    });

    return this.getProfileWithMemberships(userId);
  }

  /**
   * Records the registration choice before a session exists.
   * Called only by the secret-protected signup-intent endpoint.
   * A later call cannot replace the account type or society details.
   */
  async recordSignupIntent(dto: RecordSignupIntentDto): Promise<void> {
    const accountType = toAccountType(dto.accountType);
    const society =
      accountType === AccountType.SOCIETY_ADMIN ? requiredSociety(dto) : null;
    const phone = dto.phone?.trim() ? normalizePhone(dto.phone) : null;

    const profile = await this.prisma.userProfile.findUnique({
      where: { id: dto.userId },
      select: { platformRole: true, accountType: true },
    });
    if (profile?.platformRole === PlatformRole.PLATFORM_OWNER) {
      throw new ForbiddenException({
        message: 'Platform owner accounts are provisioned separately',
        code: 'FORBIDDEN',
      });
    }
    if (profile?.accountType) {
      throw new ConflictException({
        message: 'Account type is already set',
        code: 'CONFLICT',
      });
    }

    const existing = await this.prisma.signupIntent.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) {
      assertSameIntent(existing, accountType, society, phone);
      return;
    }

    try {
      await this.prisma.signupIntent.create({
        data: {
          userId: dto.userId,
          accountType,
          societyName: society?.name ?? null,
          city: society?.city ?? null,
          state: society?.state ?? null,
          phone,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.prisma.signupIntent.findUnique({
        where: { userId: dto.userId },
      });
      if (!raced) {
        throw error;
      }
      assertSameIntent(raced, accountType, society, phone);
    }
  }

  /**
   * Applies the signup intent stored for this token user.
   * Request bodies and Supabase user metadata are not an input.
   * SOCIETY_ADMIN creates one society and one ACTIVE membership for that user.
   * RESIDENT_USER stores the choice only. PLATFORM_OWNER is never granted here.
   */
  async completeOnboarding(userId: string): Promise<ProfileWithMemberships> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, accountType: true },
    });

    if (!profile) {
      throw new NotFoundException({
        message: 'Profile was not found',
        code: 'NOT_FOUND',
      });
    }

    if (profile.platformRole === PlatformRole.PLATFORM_OWNER) {
      throw new ForbiddenException({
        message: 'Platform owner accounts are provisioned separately',
        code: 'FORBIDDEN',
      });
    }

    if (profile.accountType) {
      throw new ConflictException({
        message: 'Account type is already set',
        code: 'CONFLICT',
      });
    }

    const intent = await this.prisma.signupIntent.findUnique({
      where: { userId },
    });
    if (!intent || intent.consumedAt) {
      throw new BadRequestException({
        message: intent?.consumedAt
          ? 'Signup choices were already used. Contact support if setup did not finish.'
          : 'Signup choices were not recorded for this account. This account cannot choose a role from the browser.',
        code: 'BAD_REQUEST',
      });
    }

    const accountType = intent.accountType;
    const society =
      accountType === AccountType.SOCIETY_ADMIN ? requiredSociety(intent) : null;
    const phone = intent.phone?.trim() ? normalizePhone(intent.phone) : undefined;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.userProfile.updateMany({
        where: {
          id: userId,
          accountType: null,
          platformRole: null,
        },
        data: {
          accountType,
          ...(phone ? { phone } : {}),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          message: 'Account type is already set',
          code: 'CONFLICT',
        });
      }

      const consumed = await tx.signupIntent.updateMany({
        where: {
          userId,
          accountType,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });

      if (consumed.count !== 1) {
        throw new ConflictException({
          message: 'Signup choices were already used',
          code: 'CONFLICT',
        });
      }

      if (!society) {
        await tx.auditLog.create({
          data: {
            societyId: null,
            actorUserId: userId,
            action: 'account.onboard',
            entityType: 'user_profile',
            entityId: userId,
            metadata: { accountType },
          },
        });
        return;
      }

      const created = await tx.society.create({
        data: {
          name: society.name,
          city: society.city,
          ...(society.state ? { state: society.state } : {}),
          status: SocietyStatus.ACTIVE,
        },
      });

      await tx.societyMembership.create({
        data: {
          societyId: created.id,
          userId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      });

      await tx.auditLog.create({
        data: {
          societyId: created.id,
          actorUserId: userId,
          action: 'account.onboard',
          entityType: 'society',
          entityId: created.id,
          metadata: { accountType },
        },
      });
    });

    return this.getProfileWithMemberships(userId);
  }
}

type StoredIntent = {
  accountType: AccountType;
  societyName: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  consumedAt: Date | null;
};

type SocietyDetails = {
  name: string;
  city: string;
  state?: string;
};

function assertSameIntent(
  existing: StoredIntent,
  accountType: AccountType,
  society: SocietyDetails | null,
  phone: string | null,
): void {
  if (existing.consumedAt) {
    throw new ConflictException({
      message: 'Signup choices are already applied',
      code: 'CONFLICT',
    });
  }

  const same =
    existing.accountType === accountType &&
    (existing.societyName ?? null) === (society?.name ?? null) &&
    (existing.city ?? null) === (society?.city ?? null) &&
    (existing.state ?? null) === (society?.state ?? null) &&
    (existing.phone ?? null) === phone;

  if (!same) {
    throw new ConflictException({
      message: 'Signup choices are already recorded',
      code: 'CONFLICT',
    });
  }
}

/**
 * Full email address, used only to find an account with no membership.
 * A partial name or domain must not list unaffiliated accounts.
 */
function exactEmailQuery(value: string): string | null {
  const email = value.trim().toLowerCase();
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@') || email.length < 5) {
    return null;
  }
  const domain = email.slice(at + 1);
  if (
    !domain.includes('.') ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    email.includes(' ')
  ) {
    return null;
  }
  return email;
}

function toAccountType(value: string): AccountType {
  if (value === MembershipRole.SOCIETY_ADMIN) {
    return AccountType.SOCIETY_ADMIN;
  }
  if (value === MembershipRole.RESIDENT_USER) {
    return AccountType.RESIDENT_USER;
  }
  throw new BadRequestException({
    message: 'Choose a society administrator or resident account',
    code: 'BAD_REQUEST',
  });
}

function normalizeEmail(email?: string): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function emailAlreadyRegistered(): ConflictException {
  return new ConflictException({
    message:
      'An account with this email already exists. Sign in with the original account.',
    code: 'EMAIL_ALREADY_REGISTERED',
  });
}

const profileIdentitySelect = {
  id: true,
  displayName: true,
  email: true,
  platformRole: true,
} as const;

function toAuthenticatedUser(
  profile: {
    id: string;
    displayName: string;
    email: string | null;
    platformRole: PlatformRole | null;
  },
  identity: VerifiedAccessToken,
): AuthenticatedUser {
  return {
    id: profile.id,
    email: profile.email ?? identity.email,
    displayName: profile.displayName,
    platformRole: profile.platformRole,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function requiredSociety(dto: {
  societyName?: string | null;
  city?: string | null;
  state?: string | null;
}): SocietyDetails {
  const name = dto.societyName?.trim() ?? '';
  const city = dto.city?.trim() ?? '';
  if (name.length < 2 || city.length < 2) {
    throw new BadRequestException({
      message: 'Society name and city are required',
      code: 'BAD_REQUEST',
    });
  }
  const state = dto.state?.trim();
  return {
    name,
    city,
    ...(state ? { state } : {}),
  };
}

function normalizePhone(value: string): string {
  return normalizeIndianPhone(value);
}
