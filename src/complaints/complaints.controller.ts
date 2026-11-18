import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import { AddComplaintCommentDto } from './dto/add-complaint-comment.dto.js';
import { AssignComplaintDto } from './dto/assign-complaint.dto.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';
import { ListComplaintsQueryDto } from './dto/list-complaints-query.dto.js';
import { ReopenComplaintDto } from './dto/reopen-complaint.dto.js';
import { ResolveComplaintDto } from './dto/resolve-complaint.dto.js';
import { ComplaintsService } from './complaints.service.js';
import { MAX_COMPLAINT_ATTACHMENT_BYTES } from './storage/complaint-attachment-storage.js';
import { attachmentContentDisposition } from './storage/image-signature.js';

@ApiTags('complaints')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post('societies/:societyId/complaints')
  @ApiCreatedResponse({ description: 'Complaint created' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateComplaintDto,
  ) {
    const data = await this.complaintsService.create(user, societyId, body);
    return { data };
  }

  @Get('societies/:societyId/complaints/dashboard')
  @ApiOperation({ summary: 'Admin complaint dashboard aggregates' })
  async dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
  ) {
    const data = await this.complaintsService.getDashboard(user, societyId);
    return { data };
  }

  @Get('societies/:societyId/complaints')
  @ApiOperation({ summary: 'List complaints (role-scoped)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListComplaintsQueryDto,
  ) {
    const data = await this.complaintsService.list(user, societyId, query);
    return { data };
  }

  @Get('complaints/:complaintId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
  ) {
    const data = await this.complaintsService.get(user, complaintId);
    return { data };
  }

  @Post('complaints/:complaintId/acknowledge')
  async acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
  ) {
    const data = await this.complaintsService.acknowledge(user, complaintId);
    return { data };
  }

  @Post('complaints/:complaintId/assign')
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() body: AssignComplaintDto,
  ) {
    const data = await this.complaintsService.assign(user, complaintId, body);
    return { data };
  }

  @Post('complaints/:complaintId/start')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
  ) {
    const data = await this.complaintsService.start(user, complaintId);
    return { data };
  }

  @Post('complaints/:complaintId/resolve')
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() body: ResolveComplaintDto,
  ) {
    const data = await this.complaintsService.resolve(user, complaintId, body);
    return { data };
  }

  @Post('complaints/:complaintId/close')
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
  ) {
    const data = await this.complaintsService.close(user, complaintId);
    return { data };
  }

  @Post('complaints/:complaintId/reopen')
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() body: ReopenComplaintDto,
  ) {
    const data = await this.complaintsService.reopen(user, complaintId, body);
    return { data };
  }

  @Get('complaints/:complaintId/comments')
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
  ) {
    const items = await this.complaintsService.listComments(user, complaintId);
    return { data: { items } };
  }

  @Post('complaints/:complaintId/comments')
  @ApiCreatedResponse({ description: 'Comment created' })
  async addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() body: AddComplaintCommentDto,
  ) {
    const data = await this.complaintsService.addComment(
      user,
      complaintId,
      body,
    );
    return { data };
  }

  @Post('complaints/:complaintId/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_COMPLAINT_ATTACHMENT_BYTES },
    }),
  )
  async addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) {
      throw new BadRequestException({
        message: 'file is required',
        code: 'BAD_REQUEST',
      });
    }
    const data = await this.complaintsService.addAttachment(
      user,
      complaintId,
      file,
    );
    return { data };
  }

  @Get('complaint-attachments/:attachmentId')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Authorized attachment download' })
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    const file = await this.complaintsService.downloadAttachment(
      user,
      attachmentId,
    );
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: attachmentContentDisposition(file.filename),
    });
  }
}
