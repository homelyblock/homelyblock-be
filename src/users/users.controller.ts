import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UsersService } from '../auth/users.service.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { SearchUsersQueryDto } from './dto/search-users-query.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard, AuthorizationGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Get('search')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Search profiles for member assignment. Platform owners search the platform. Society admins search their own society by name or email, and can find an unaffiliated account only by its full email. Search never creates an account or membership.',
  })
  @ApiOkResponse({ description: 'Matching profiles (minimal fields)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Caller is not a platform owner or society admin',
  })
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchUsersQueryDto,
  ) {
    const scope = await this.authorization.resolveUserSearchScope(
      user,
      query.societyId,
    );
    const items = await this.usersService.searchProfiles(
      query.q,
      query.limit,
      scope,
    );
    return { data: { items } };
  }
}
