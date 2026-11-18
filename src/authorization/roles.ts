import { MembershipRole, PlatformRole } from '../generated/prisma/client.js';

/**
 * Single source of truth for LivingSpace roles.
 * Values match Prisma enums / DATABASE.md — do not invent parallel strings.
 */
export { MembershipRole, PlatformRole };

export const PLATFORM_ROLES = [PlatformRole.PLATFORM_OWNER] as const;

export const SOCIETY_ROLES = [
  MembershipRole.SOCIETY_ADMIN,
  MembershipRole.RESIDENT_USER,
] as const;

export type PlatformRoleName = (typeof PLATFORM_ROLES)[number];
export type SocietyRoleName = (typeof SOCIETY_ROLES)[number];

/** Active memberships only may authorize society-scoped actions. */
export const AUTHORIZED_MEMBERSHIP_STATUSES = ['ACTIVE'] as const;
