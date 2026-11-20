import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import { CreateMembershipDto } from './dto/create-membership.dto.js';
import { ListMembershipsQueryDto } from './dto/list-memberships-query.dto.js';
import { UpdateMembershipDto } from './dto/update-membership.dto.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get('societies/:societyId/members')
  @ApiOperation({
    summary:
      'List memberships in a society (active society admins and platform owners)',
  })
  @ApiOkResponse({ description: 'Membership list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListMembershipsQueryDto,
  ) {
    const page = await this.membershipsService.list(user, societyId, query);
    return { data: page };
  }

  @Post('societies/:societyId/members')
  @ApiOperation({
    summary:
      'Invite an existing account. The membership is always created as INVITED and does not grant society access until a later activation.',
  })
  @ApiCreatedResponse({ description: 'Membership created' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateMembershipDto,
  ) {
    const membership = await this.membershipsService.create(
      user,
      societyId,
      body,
    );
    return { data: membership };
  }

  @Patch('memberships/:membershipId')
  @ApiOperation({
    summary:
      'Update a society membership. Cannot demote or deactivate the last active society administrator.',
  })
  @ApiOkResponse({ description: 'Membership updated' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: UpdateMembershipDto,
  ) {
    const membership = await this.membershipsService.update(
      user,
      membershipId,
      body,
    );
    return { data: membership };
  }
}
