import {
  Body,
  Controller,
  Delete,
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
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { ListNoticesQueryDto } from './dto/list-notices-query.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { NoticesService } from './notices.service.js';

@ApiTags('notices')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get('societies/:societyId/notices')
  @ApiOperation({ summary: 'List notices visible to the caller' })
  @ApiOkResponse({ description: 'Paginated notices' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListNoticesQueryDto,
  ) {
    const data = await this.noticesService.list(user, societyId, query);
    return { data };
  }

  @Post('societies/:societyId/notices')
  @ApiOperation({ summary: 'Create a draft notice' })
  @ApiCreatedResponse({ description: 'Notice created as DRAFT' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateNoticeDto,
  ) {
    const notice = await this.noticesService.create(user, societyId, body);
    return { data: notice };
  }

  @Get('notices/:noticeId')
  @ApiOperation({ summary: 'Get notice detail' })
  @ApiOkResponse({ description: 'Notice detail' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    const notice = await this.noticesService.getById(user, noticeId);
    return { data: notice };
  }

  @Patch('notices/:noticeId')
  @ApiOperation({ summary: 'Update a draft notice' })
  @ApiOkResponse({ description: 'Notice updated' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() body: UpdateNoticeDto,
  ) {
    const notice = await this.noticesService.update(user, noticeId, body);
    return { data: notice };
  }

  @Post('notices/:noticeId/publish')
  @ApiOperation({ summary: 'Publish a draft notice' })
  @ApiOkResponse({ description: 'Notice published' })
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    const notice = await this.noticesService.publish(user, noticeId);
    return { data: notice };
  }

  @Post('notices/:noticeId/archive')
  @ApiOperation({ summary: 'Archive a published notice' })
  @ApiOkResponse({ description: 'Notice archived' })
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    const notice = await this.noticesService.archive(user, noticeId);
    return { data: notice };
  }

  @Delete('notices/:noticeId')
  @ApiOperation({ summary: 'Delete a draft notice' })
  @ApiOkResponse({ description: 'Draft notice deleted' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    const result = await this.noticesService.deleteDraft(user, noticeId);
    return { data: result };
  }

  @Post('notices/:noticeId/read')
  @ApiOperation({ summary: 'Mark a published notice as read for the caller' })
  @ApiOkResponse({ description: 'Read recorded (idempotent)' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    const result = await this.noticesService.markRead(user, noticeId);
    return { data: result };
  }

  @Get('notices/:noticeId/readership')
  @ApiOperation({ summary: 'Get notice readership statistics (admins)' })
  @ApiOkResponse({ description: 'Aggregate readership stats' })
  async getReadership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    const stats = await this.noticesService.getReadership(user, noticeId);
    return { data: stats };
  }
}
