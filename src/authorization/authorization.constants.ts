import type { MembershipRole, PlatformRole } from './roles.js';

export const REQUIRE_PLATFORM_ROLES_KEY = 'livingspace:requirePlatformRoles';
export const REQUIRE_SOCIETY_ROLES_KEY = 'livingspace:requireSocietyRoles';

export type RequirePlatformRolesMetadata = {
  roles: PlatformRole[];
};

export type RequireSocietyRolesMetadata = {
  roles: MembershipRole[];
  /** Route param that holds the society UUID. Defaults to `societyId`. */
  societyIdParam: string;
};
