import { SetMetadata } from '@nestjs/common';
import {
  REQUIRE_PLATFORM_ROLES_KEY,
  type RequirePlatformRolesMetadata,
} from './authorization.constants.js';
import type { PlatformRole } from './roles.js';

/**
 * Requires an authenticated user whose `user_profiles.platform_role`
 * is one of the listed platform roles. Does not grant society access.
 */
export const RequirePlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(REQUIRE_PLATFORM_ROLES_KEY, {
    roles,
  } satisfies RequirePlatformRolesMetadata);
