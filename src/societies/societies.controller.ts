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
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import { RequirePlatformRoles } from '../authorization/require-platform-roles.decorator.js';
import { PlatformRole } from '../authorization/roles.js';
import { CreateSocietyDto } from './dto/create-society.dto.js';
import { ListSocietiesQueryDto } from './dto/list-societies-query.dto.js';
import { UpdateSocietyDto } from './dto/update-society.dto.js';
import { SocietiesService } from './societies.service.js';

@ApiTags('societies')
@ApiBearerAuth()
@Controller('societies')
@UseGuards(AuthGuard, AuthorizationGuard)
export class SocietiesController {
  constructor(private readonly societiesService: SocietiesService) {}

  @Post()
  @RequirePlatformRoles(PlatformRole.PLATFORM_OWNER)
  @ApiOperation({
    summary: 'Create a society and assign an initial society admin',
  })
  @ApiCreatedResponse({ description: 'Society and membership created' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Caller is not a platform owner' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSocietyDto,
  ) {
    const result = await this.societiesService.create(user, body);
    return { data: result };
  }

  @Get()
  @ApiOperation({
    summary: 'List societies visible to the authenticated caller',
  })
  @ApiOkResponse({ description: 'Paginated society list' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSocietiesQueryDto,
  ) {
    const result = await this.societiesService.list(
      user,
      query.page,
      query.limit,
    );
    return { data: result };
  }

  @Get(':societyId')
  @ApiOperation({
    summary: 'Get society details when the caller is authorized',
  })
  @ApiOkResponse({ description: 'Society detail (role-scoped fields)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
  ) {
    const society = await this.societiesService.getById(user, societyId);
    return { data: society };
  }

  @Patch(':societyId')
  @ApiOperation({
    summary: 'Partially update a society (platform owner or society admin)',
  })
  @ApiOkResponse({ description: 'Updated society' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Caller cannot administer this society',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: UpdateSocietyDto,
  ) {
    const society = await this.societiesService.update(user, societyId, body);
    return { data: society };
  }
}
