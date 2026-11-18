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
import {
  CreateAdminHouseholdMemberDto,
  CreateOwnHouseholdMemberDto,
} from './dto/create-household-member.dto.js';
import {
  ListOwnHouseholdQueryDto,
  ListSocietyHouseholdsQueryDto,
} from './dto/list-households-query.dto.js';
import { UpdateHouseholdMemberDto } from './dto/update-household-member.dto.js';
import { HouseholdsService } from './households.service.js';

@ApiTags('households')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get('me/household')
  @ApiOperation({
    summary: 'List household members for the caller in a society',
  })
  async listOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOwnHouseholdQueryDto,
  ) {
    const data = await this.households.listOwn(
      user,
      query.societyId,
      query.active !== false,
    );
    return { data };
  }

  @Post('me/household')
  @ApiCreatedResponse({ description: 'Household member created' })
  async createOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateOwnHouseholdMemberDto,
  ) {
    const data = await this.households.createOwn(user, body);
    return { data };
  }

  @Post('societies/:societyId/household-members')
  @ApiCreatedResponse({
    description: 'Admin-created household member for a membership',
  })
  async createAsAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateAdminHouseholdMemberDto,
  ) {
    const data = await this.households.createAsAdmin(user, societyId, body);
    return { data };
  }

  @Patch('household-members/:id')
  @ApiOkResponse({ description: 'Household member updated' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateHouseholdMemberDto,
  ) {
    const data = await this.households.update(user, id, body);
    return { data };
  }

  @Patch('household-members/:id/deactivate')
  @ApiOkResponse({ description: 'Household member deactivated' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.households.deactivate(user, id);
    return { data };
  }

  @Get('societies/:societyId/households')
  @ApiOperation({
    summary: 'Admin resident directory with household occupancy',
  })
  async listSociety(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListSocietyHouseholdsQueryDto,
  ) {
    const data = await this.households.listSocietyHouseholds(
      user,
      societyId,
      query,
    );
    return { data };
  }

  @Get('societies/:societyId/households/:unitId')
  @ApiOperation({ summary: 'Admin unit occupancy and household members' })
  async getUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    const data = await this.households.getUnitHousehold(
      user,
      societyId,
      unitId,
    );
    return { data };
  }
}
