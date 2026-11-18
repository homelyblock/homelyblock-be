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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { UpdateUnitDto } from './dto/update-unit.dto.js';
import { UnitsService } from './units.service.js';

@ApiTags('units')
@ApiBearerAuth()
@Controller('societies/:societyId/units')
@UseGuards(AuthGuard, AuthorizationGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({
    summary: 'List units in a society (active society admins and platform owners)',
  })
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiOkResponse({ description: 'Unit list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query('buildingId', new ParseUUIDPipe({ optional: true }))
    buildingId?: string,
  ) {
    const items = await this.unitsService.listBySociety(
      user,
      societyId,
      buildingId,
    );
    return { data: { items } };
  }

  @Post()
  @ApiOperation({ summary: 'Create a unit in a society building' })
  @ApiCreatedResponse({ description: 'Unit created' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateUnitDto,
  ) {
    const unit = await this.unitsService.create(user, societyId, body);
    return { data: unit };
  }

  @Get(':unitId')
  @ApiOperation({
    summary: 'Get a unit in a society (active society admins and platform owners)',
  })
  @ApiOkResponse({ description: 'Unit detail' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    const unit = await this.unitsService.getById(user, societyId, unitId);
    return { data: unit };
  }

  @Patch(':unitId')
  @ApiOperation({ summary: 'Update a unit in a society' })
  @ApiOkResponse({ description: 'Unit updated' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() body: UpdateUnitDto,
  ) {
    const unit = await this.unitsService.update(user, societyId, unitId, body);
    return { data: unit };
  }
}
