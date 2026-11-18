import { SetMetadata } from '@nestjs/common';
import {
  REQUIRE_SOCIETY_ROLES_KEY,
  type RequireSocietyRolesMetadata,
} from './authorization.constants.js';
import type { MembershipRole } from './roles.js';

type RequireSocietyRolesOptions = {
  societyIdParam?: string;
};

/**
 * Requires an ACTIVE society membership for the society in the route params
 * with one of the listed membership roles. Platform ownership alone is not enough.
 */
export const RequireSocietyRoles = (
  roles: MembershipRole[],
  options: RequireSocietyRolesOptions = {},
) =>
  SetMetadata(REQUIRE_SOCIETY_ROLES_KEY, {
    roles,
    societyIdParam: options.societyIdParam ?? 'societyId',
  } satisfies RequireSocietyRolesMetadata);
