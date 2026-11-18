import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { BuildingsService } from './buildings.service.js';
import { CreateBuildingDto } from './dto/create-building.dto.js';
import { UpdateBuildingDto } from './dto/update-building.dto.js';

@ApiTags('buildings')
@ApiBearerAuth()
@Controller('societies/:societyId/buildings')
@UseGuards(AuthGuard, AuthorizationGuard)
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List buildings in a society (active society admins and platform owners)',
  })
  @ApiOkResponse({ description: 'Building list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
  ) {
    const items = await this.buildingsService.list(user, societyId);
    return { data: { items } };
  }

  @Post()
  @ApiOperation({ summary: 'Create a building in a society' })
  @ApiCreatedResponse({ description: 'Building created' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateBuildingDto,
  ) {
    const building = await this.buildingsService.create(user, societyId, body);
    return { data: building };
  }

  @Get(':buildingId')
  @ApiOperation({
    summary: 'Get a building in a society (active society admins and platform owners)',
  })
  @ApiOkResponse({ description: 'Building detail' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
  ) {
    const building = await this.buildingsService.getById(
      user,
      societyId,
      buildingId,
    );
    return { data: building };
  }

  @Patch(':buildingId')
  @ApiOperation({ summary: 'Update a building in a society' })
  @ApiOkResponse({ description: 'Building updated' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @Body() body: UpdateBuildingDto,
  ) {
    const building = await this.buildingsService.update(
      user,
      societyId,
      buildingId,
      body,
    );
    return { data: building };
  }
}
