import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from './authorization.guard.js';
import { CurrentSocietyMembership } from './current-society-membership.decorator.js';
import { RequirePlatformRoles } from './require-platform-roles.decorator.js';
import { RequireSocietyRoles } from './require-society-roles.decorator.js';
import type { AuthorizedSocietyMembership } from './authorization.service.js';
import { MembershipRole, PlatformRole } from './roles.js';

/**
 * Non-product probe routes that demonstrate RBAC wiring.
 * Society/notice/visitor business features are implemented separately.
 */
@ApiTags('rbac')
@ApiBearerAuth()
@Controller('rbac')
@UseGuards(AuthGuard, AuthorizationGuard)
export class RbacProbeController {
  @Get('platform-owners')
  @RequirePlatformRoles(PlatformRole.PLATFORM_OWNER)
  @ApiOperation({
    summary: 'Platform-owner probe (authorization example)',
  })
  @ApiOkResponse({ description: 'Caller has PLATFORM_OWNER' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Authenticated but not platform owner' })
  platformOwners(@CurrentUser() user: AuthenticatedUser) {
    return {
      data: {
        allowed: true,
        scope: 'platform',
        userId: user.id,
        platformRole: user.platformRole,
      },
    };
  }

  @Get('societies/:societyId/admins')
  @RequireSocietyRoles([MembershipRole.SOCIETY_ADMIN])
  @ApiOperation({
    summary: 'Society-admin probe for a specific society',
  })
  @ApiOkResponse({ description: 'Caller is ACTIVE SOCIETY_ADMIN in society' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Not an active society admin for this society',
  })
  societyAdmins(
    @Param('societyId') societyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSocietyMembership() membership: AuthorizedSocietyMembership,
  ) {
    return {
      data: {
        allowed: true,
        scope: 'society_admin',
        societyId,
        userId: user.id,
        membershipRole: membership.role,
      },
    };
  }

  @Get('societies/:societyId/members')
  @RequireSocietyRoles([
    MembershipRole.SOCIETY_ADMIN,
    MembershipRole.RESIDENT_USER,
  ])
  @ApiOperation({
    summary: 'Society-member probe (admin or resident) for a specific society',
  })
  @ApiOkResponse({ description: 'Caller is an active member of the society' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Not an active member of this society',
  })
  societyMembers(
    @Param('societyId') societyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSocietyMembership() membership: AuthorizedSocietyMembership,
  ) {
    return {
      data: {
        allowed: true,
        scope: 'society_member',
        societyId,
        userId: user.id,
        membershipRole: membership.role,
      },
    };
  }
}
