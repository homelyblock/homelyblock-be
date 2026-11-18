import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateExpectedVisitorDto } from './dto/create-expected-visitor.dto.js';
import { CreateWalkInVisitorDto } from './dto/create-walk-in-visitor.dto.js';
import { ListVisitorsQueryDto } from './dto/list-visitors-query.dto.js';
import { VisitorsService } from './visitors.service.js';

@ApiTags('visitors')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Get('societies/:societyId/visitors')
  @ApiOperation({ summary: 'List visitors (scoped by role)' })
  @ApiOkResponse({ description: 'Paginated visitor list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListVisitorsQueryDto,
  ) {
    const data = await this.visitorsService.list(user, societyId, query);
    return { data };
  }

  @Post('societies/:societyId/visitors/expected')
  @ApiOperation({ summary: 'Register an expected visitor for the caller unit' })
  @ApiCreatedResponse({ description: 'Expected visitor created as PENDING' })
  async createExpected(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateExpectedVisitorDto,
  ) {
    const visitor = await this.visitorsService.createExpected(
      user,
      societyId,
      body,
    );
    return { data: visitor };
  }

  @Post('societies/:societyId/visitors/walk-ins')
  @ApiOperation({ summary: 'Register a walk-in visitor (society admin)' })
  @ApiCreatedResponse({
    description: 'Walk-in visitor created as PENDING (resident approval required)',
  })
  async createWalkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateWalkInVisitorDto,
  ) {
    const visitor = await this.visitorsService.createWalkIn(
      user,
      societyId,
      body,
    );
    return { data: visitor };
  }

  @Get('visitors/:visitorId')
  @ApiOperation({ summary: 'Get visitor detail' })
  @ApiOkResponse({ description: 'Visitor detail' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
  ) {
    const visitor = await this.visitorsService.getById(user, visitorId);
    return { data: visitor };
  }

  @Post('visitors/:visitorId/approve')
  @ApiOperation({ summary: 'Approve a pending visitor (unit resident)' })
  @ApiOkResponse({ description: 'Visitor approved' })
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
  ) {
    const visitor = await this.visitorsService.approve(user, visitorId);
    return { data: visitor };
  }

  @Post('visitors/:visitorId/reject')
  @ApiOperation({ summary: 'Reject a pending visitor (unit resident)' })
  @ApiOkResponse({ description: 'Visitor rejected' })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
  ) {
    const visitor = await this.visitorsService.reject(user, visitorId);
    return { data: visitor };
  }

  @Post('visitors/:visitorId/cancel')
  @ApiOperation({ summary: 'Cancel an eligible upcoming visitor request' })
  @ApiOkResponse({ description: 'Visitor cancelled' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
  ) {
    const visitor = await this.visitorsService.cancel(user, visitorId);
    return { data: visitor };
  }

  @Post('visitors/:visitorId/check-in')
  @ApiOperation({ summary: 'Check in an approved visitor (society admin)' })
  @ApiOkResponse({ description: 'Visitor checked in' })
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
  ) {
    const visitor = await this.visitorsService.checkIn(user, visitorId);
    return { data: visitor };
  }

  @Post('visitors/:visitorId/check-out')
  @ApiOperation({ summary: 'Check out a checked-in visitor (society admin)' })
  @ApiOkResponse({ description: 'Visitor checked out' })
  async checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId', ParseUUIDPipe) visitorId: string,
  ) {
    const visitor = await this.visitorsService.checkOut(user, visitorId);
    return { data: visitor };
  }
}
