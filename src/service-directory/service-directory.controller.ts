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
import { CreateServiceDto } from './dto/create-service.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServiceDirectoryService } from './service-directory.service.js';

@ApiTags('services')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class ServiceDirectoryController {
  constructor(private readonly services: ServiceDirectoryService) {}

  @Get('societies/:societyId/services')
  @ApiOperation({ summary: 'List society service providers (role-scoped)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListServicesQueryDto,
  ) {
    const data = await this.services.list(user, societyId, query);
    return { data };
  }

  @Post('societies/:societyId/services')
  @ApiCreatedResponse({ description: 'Service provider created' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateServiceDto,
  ) {
    const data = await this.services.create(user, societyId, body);
    return { data };
  }

  @Get('services/:serviceId')
  @ApiOkResponse({ description: 'Service provider detail' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    const data = await this.services.get(user, serviceId);
    return { data };
  }

  @Patch('services/:serviceId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() body: UpdateServiceDto,
  ) {
    const data = await this.services.update(user, serviceId, body);
    return { data };
  }

  @Patch('services/:serviceId/deactivate')
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    const data = await this.services.deactivate(user, serviceId);
    return { data };
  }

  @Patch('services/:serviceId/activate')
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    const data = await this.services.activate(user, serviceId);
    return { data };
  }
}
