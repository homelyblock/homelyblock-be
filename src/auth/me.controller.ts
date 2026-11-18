import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from './auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedUser } from './auth.types.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Current authenticated user and society memberships',
  })
  @ApiOkResponse({ description: 'Verified identity and local profile' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.usersService.getProfileWithMemberships(user.id);
    return { data: toMeDto(profile, user) };
  }

  @Post('onboarding')
  @ApiOperation({
    summary:
      'Apply the server-recorded signup choice once. The request body is ignored.',
  })
  @ApiOkResponse({ description: 'Account type stored for the authenticated user' })
  @ApiForbiddenResponse({
    description: 'Platform owner accounts cannot use public onboarding',
  })
  @ApiConflictResponse({ description: 'Account type is already set' })
  async completeOnboarding(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.usersService.completeOnboarding(user.id);
    return { data: toMeDto(profile, user) };
  }

  @Patch()
  @ApiOperation({
    summary:
      'Update own profile (displayName, phone). Email, account type, and roles are not writable.',
  })
  @ApiOkResponse({ description: 'Updated profile' })
  async patchMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileDto,
  ) {
    const profile = await this.usersService.updateOwnProfile(user.id, body);
    return { data: toMeDto(profile, user) };
  }
}

function toMeDto(
  profile: Awaited<ReturnType<UsersService['getProfileWithMemberships']>>,
  user: AuthenticatedUser,
) {
  return {
    id: profile.id,
    email: profile.email ?? user.email ?? null,
    displayName: profile.displayName,
    phone: profile.phone,
    platformRole: profile.platformRole,
    accountType: profile.accountType,
    memberships: profile.memberships,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
