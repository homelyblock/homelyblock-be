import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import {
  ActivityQueryDto,
  AdminDashboardQueryDto,
} from './dto/dashboard-query.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('societies/:societyId/dashboard')
@UseGuards(AuthGuard, AuthorizationGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('resident')
  @ApiOperation({
    summary: 'Resident society dashboard (ACTIVE resident membership)',
  })
  @ApiOkResponse({ description: 'Resident dashboard summary' })
  async resident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
  ) {
    const data = await this.dashboard.getResidentDashboard(user, societyId);
    return { data };
  }

  @Get('admin')
  @ApiOperation({
    summary: 'Society admin dashboard (admin / platform owner)',
  })
  @ApiOkResponse({ description: 'Admin dashboard summary' })
  async admin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: AdminDashboardQueryDto,
  ) {
    const data = await this.dashboard.getAdminDashboard(user, societyId, {
      periodYear: query.periodYear,
      periodMonth: query.periodMonth,
    });
    return { data };
  }

  @Get('attention')
  @ApiOperation({
    summary: 'Role-scoped counts of items that still need attention',
  })
  @ApiOkResponse({ description: 'Attention counts for the caller and society' })
  async attention(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
  ) {
    const data = await this.dashboard.getAttention(user, societyId);
    return { data };
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Recent society activity (role-scoped)',
  })
  async activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ActivityQueryDto,
  ) {
    const data = await this.dashboard.getActivity(
      user,
      societyId,
      query.limit ?? 15,
    );
    return { data };
  }
}
