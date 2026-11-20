import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  ComplaintPriority,
  ComplaintStatus,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canTransition } from './complaint-transitions.js';
import {
  toAttachmentDto,
  toCommentDto,
  toComplaintDto,
  type ComplaintAttachmentDto,
  type ComplaintCommentDto,
  type ComplaintDashboardDto,
  type ComplaintDto,
} from './complaints.mapper.js';
import type { AddComplaintCommentDto } from './dto/add-complaint-comment.dto.js';
import type { AssignComplaintDto } from './dto/assign-complaint.dto.js';
import type { CreateComplaintDto } from './dto/create-complaint.dto.js';
import type { ListComplaintsQueryDto } from './dto/list-complaints-query.dto.js';
import type { ReopenComplaintDto } from './dto/reopen-complaint.dto.js';
import type { ResolveComplaintDto } from './dto/resolve-complaint.dto.js';
import {
  COMPLAINT_ATTACHMENT_STORAGE,
  MAX_COMPLAINT_ATTACHMENT_BYTES,
  MAX_COMPLAINT_ATTACHMENTS_PER_COMPLAINT,
  type ComplaintAttachmentStorage,
} from './storage/complaint-attachment-storage.js';
import {
  checkComplaintImage,
  safeAttachmentFilename,
} from './storage/image-signature.js';

const detailIncludes = {
  unit: { select: { unitNumber: true } },
  building: { select: { code: true } },
  createdBy: { select: { displayName: true } },
  assignedTo: { select: { displayName: true } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: { changedBy: { select: { displayName: true } } },
  },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { displayName: true } } },
  },
  attachments: { orderBy: { createdAt: 'asc' as const } },
} as const;

export type PaginatedComplaints = {
  items: ComplaintDto[];
  page: number;
  limit: number;
  total: number;
};

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(COMPLAINT_ATTACHMENT_STORAGE)
    private readonly storage: ComplaintAttachmentStorage,
  ) {}

  async create(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateComplaintDto,
  ): Promise<ComplaintDto> {
    const membership = await this.requireActiveResident(user, societyId);
    if (!membership.primaryUnitId) {
      throw new BadRequestException({
        message: 'Active residents need a primary unit to create complaints',
        code: 'BAD_REQUEST',
      });
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: membership.primaryUnitId, societyId },
      select: { id: true, buildingId: true },
    });
    if (!unit) {
      throw new BadRequestException({
        message: 'Primary unit was not found in this society',
        code: 'BAD_REQUEST',
      });
    }

    const complaint = await this.prisma.$transaction(async (tx) => {
      const created = await tx.complaint.create({
        data: {
          societyId,
          buildingId: unit.buildingId,
          unitId: unit.id,
          createdByUserId: user.id,
          title: dto.title.trim(),
          description: dto.description.trim(),
          category: dto.category,
          priority: dto.priority ?? ComplaintPriority.MEDIUM,
          status: ComplaintStatus.OPEN,
        },
        include: detailIncludes,
      });
      await tx.complaintStatusHistory.create({
        data: {
          complaintId: created.id,
          fromStatus: null,
          toStatus: ComplaintStatus.OPEN,
          changedByUserId: user.id,
          note: 'Complaint created',
        },
      });
      return tx.complaint.findUniqueOrThrow({
        where: { id: created.id },
        include: detailIncludes,
      });
    });

    await this.audit(user.id, societyId, 'complaint.create', complaint.id);
    return toComplaintDto(complaint);
  }

  async list(
    user: AuthenticatedUser,
    societyId: string,
    query: ListComplaintsQueryDto,
  ): Promise<PaginatedComplaints> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin = await this.isSocietyAdmin(user, societyId, membership?.role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ComplaintWhereInput = {
      societyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (isAdmin) {
      if (query.unitId) where.unitId = query.unitId;
    } else {
      where.createdByUserId = user.id;
      if (query.unitId && membership?.primaryUnitId !== query.unitId) {
        throw new ForbiddenException({
          message: 'You can only list your own complaints',
          code: 'FORBIDDEN',
        });
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.complaint.count({ where }),
      this.prisma.complaint.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          unit: { select: { unitNumber: true } },
          building: { select: { code: true } },
          createdBy: { select: { displayName: true } },
          assignedTo: { select: { displayName: true } },
        },
      }),
    ]);

    return {
      items: rows.map(toComplaintDto),
      page,
      limit,
      total,
    };
  }

  async getDashboard(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<ComplaintDashboardDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const where = { societyId };
    const [byStatus, byCategory, highOrUrgent, recent] = await Promise.all([
      this.prisma.complaint.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.complaint.groupBy({
        by: ['category'],
        where,
        _count: { _all: true },
      }),
      this.prisma.complaint.count({
        where: {
          societyId,
          priority: {
            in: [ComplaintPriority.HIGH, ComplaintPriority.URGENT],
          },
        },
      }),
      this.prisma.complaint.findMany({
        where,
        select: {
          id: true,
          status: true,
          priority: true,
          category: true,
          createdAt: true,
          title: true,
          buildingId: true,
          unitId: true,
          societyId: true,
          createdByUserId: true,
          assignedToUserId: true,
          description: true,
          resolutionNotes: true,
          resolvedAt: true,
          closedAt: true,
          updatedAt: true,
          unit: { select: { unitNumber: true } },
          building: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    const countFor = (statuses: ComplaintStatus[]) =>
      byStatus
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      open: countFor([
        ComplaintStatus.OPEN,
        ComplaintStatus.ACKNOWLEDGED,
        ComplaintStatus.REOPENED,
      ]),
      inProgress: countFor([ComplaintStatus.IN_PROGRESS]),
      resolved: countFor([ComplaintStatus.RESOLVED]),
      highOrUrgent,
      byCategory: byCategory.map((row) => ({
        category: row.category,
        count: row._count._all,
      })),
      recent: recent.map(toComplaintDto),
    };
  }

  async get(
    user: AuthenticatedUser,
    complaintId: string,
  ): Promise<ComplaintDto> {
    const complaint = await this.requireComplaint(complaintId);
    await this.assertCanViewComplaint(user, complaint);
    return toComplaintDto(complaint);
  }

  async acknowledge(
    user: AuthenticatedUser,
    complaintId: string,
  ): Promise<ComplaintDto> {
    return this.adminTransition(
      user,
      complaintId,
      ComplaintStatus.ACKNOWLEDGED,
      'Acknowledged by society admin',
    );
  }

  async start(
    user: AuthenticatedUser,
    complaintId: string,
  ): Promise<ComplaintDto> {
    return this.adminTransition(
      user,
      complaintId,
      ComplaintStatus.IN_PROGRESS,
      'Marked in progress',
    );
  }

  async close(
    user: AuthenticatedUser,
    complaintId: string,
  ): Promise<ComplaintDto> {
    return this.adminTransition(
      user,
      complaintId,
      ComplaintStatus.CLOSED,
      'Closed by society admin',
      { closedAt: new Date() },
    );
  }

  async resolve(
    user: AuthenticatedUser,
    complaintId: string,
    dto: ResolveComplaintDto,
  ): Promise<ComplaintDto> {
    return this.adminTransition(
      user,
      complaintId,
      ComplaintStatus.RESOLVED,
      dto.resolutionNotes.trim(),
      {
        resolutionNotes: dto.resolutionNotes.trim(),
        resolvedAt: new Date(),
      },
    );
  }

  async assign(
    user: AuthenticatedUser,
    complaintId: string,
    dto: AssignComplaintDto,
  ): Promise<ComplaintDto> {
    const complaint = await this.requireComplaint(complaintId);
    await this.authorization.assertCanAdministerSociety(
      user,
      complaint.societyId,
    );

    const assigneeMembership = await this.prisma.societyMembership.findFirst({
      where: {
        societyId: complaint.societyId,
        userId: dto.assigneeUserId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!assigneeMembership) {
      throw new BadRequestException({
        message: 'Assignee must be an active member of this society',
        code: 'BAD_REQUEST',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let nextStatus = complaint.status;
      if (
        complaint.status === ComplaintStatus.OPEN &&
        canTransition(complaint.status, ComplaintStatus.ACKNOWLEDGED)
      ) {
        nextStatus = ComplaintStatus.ACKNOWLEDGED;
      }

      const changed = await tx.complaint.updateMany({
        where: { id: complaintId, status: complaint.status },
        data: {
          assignedToUserId: dto.assigneeUserId,
          status: nextStatus,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          message: 'Complaint status changed. Refresh and try again.',
          code: 'CONFLICT',
        });
      }

      if (nextStatus !== complaint.status) {
        await tx.complaintStatusHistory.create({
          data: {
            complaintId,
            fromStatus: complaint.status,
            toStatus: nextStatus,
            changedByUserId: user.id,
            note: 'Assigned and acknowledged',
          },
        });
      }

      return tx.complaint.findUniqueOrThrow({
        where: { id: complaintId },
        include: detailIncludes,
      });
    });

    await this.audit(user.id, complaint.societyId, 'complaint.assign', complaintId, {
      assigneeUserId: dto.assigneeUserId,
    });
    return toComplaintDto(updated);
  }

  async reopen(
    user: AuthenticatedUser,
    complaintId: string,
    dto: ReopenComplaintDto,
  ): Promise<ComplaintDto> {
    const complaint = await this.requireComplaint(complaintId);
    await this.assertCanViewComplaint(user, complaint);

    const isAdmin = await this.isSocietyAdmin(user, complaint.societyId);
    const isOwner = complaint.createdByUserId === user.id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException({
        message: 'Only the complaint owner or a society admin can reopen',
        code: 'FORBIDDEN',
      });
    }

    if (!isAdmin && complaint.status !== ComplaintStatus.RESOLVED) {
      throw new ConflictException({
        message: 'Residents can only reopen resolved complaints',
        code: 'CONFLICT',
      });
    }

    if (!canTransition(complaint.status, ComplaintStatus.REOPENED)) {
      throw new ConflictException({
        message: `Cannot reopen complaint from status ${complaint.status}`,
        code: 'INVALID_TRANSITION',
      });
    }

    const updated = await this.applyTransition(
      user,
      complaint,
      ComplaintStatus.REOPENED,
      dto.note?.trim() || 'Complaint reopened',
      { resolvedAt: null, closedAt: null, resolutionNotes: complaint.resolutionNotes },
    );
    return updated;
  }

  async addComment(
    user: AuthenticatedUser,
    complaintId: string,
    dto: AddComplaintCommentDto,
  ): Promise<ComplaintCommentDto> {
    const complaint = await this.requireComplaint(complaintId);
    await this.assertCanViewComplaint(user, complaint);

    const comment = await this.prisma.complaintComment.create({
      data: {
        complaintId,
        authorUserId: user.id,
        body: dto.body.trim(),
      },
      include: { author: { select: { displayName: true } } },
    });
    await this.audit(user.id, complaint.societyId, 'complaint.comment', comment.id, {
      complaintId,
    });
    return toCommentDto(comment);
  }

  async listComments(
    user: AuthenticatedUser,
    complaintId: string,
  ): Promise<ComplaintCommentDto[]> {
    const complaint = await this.requireComplaint(complaintId);
    await this.assertCanViewComplaint(user, complaint);
    const comments = await this.prisma.complaintComment.findMany({
      where: { complaintId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { displayName: true } } },
    });
    return comments.map(toCommentDto);
  }

  async addAttachment(
    user: AuthenticatedUser,
    complaintId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<ComplaintAttachmentDto> {
    if (!this.storage.enabled) {
      // Triggers the documented ServiceUnavailableException from the disabled provider.
      await this.storage.put('noop', Buffer.alloc(0), 'application/octet-stream');
    }

    const complaint = await this.requireComplaint(complaintId);
    await this.assertCanModifyAttachments(user, complaint);

    if (file.size > MAX_COMPLAINT_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException({
        message: 'Attachment exceeds the 5MB size limit',
        code: 'PAYLOAD_TOO_LARGE',
      });
    }
    const image = checkComplaintImage(file);
    if (!image.ok) {
      const message =
        image.reason === 'extension'
          ? 'The file extension does not match the image content'
          : image.reason === 'mime'
            ? 'The file content does not match the declared image type'
            : 'Only JPEG, PNG, and WebP images are allowed';
      throw new UnsupportedMediaTypeException({
        message,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }

    const existingCount = await this.prisma.complaintAttachment.count({
      where: { complaintId },
    });
    if (existingCount >= MAX_COMPLAINT_ATTACHMENTS_PER_COMPLAINT) {
      throw new BadRequestException({
        message: `A complaint may have at most ${MAX_COMPLAINT_ATTACHMENTS_PER_COMPLAINT} images`,
        code: 'BAD_REQUEST',
      });
    }

    const attachmentId = randomUUID();
    const storageKey = `${complaint.societyId}/${complaintId}/${attachmentId}`;
    await this.storage.put(storageKey, file.buffer, image.contentType);

    try {
      const attachment = await this.prisma.complaintAttachment.create({
        data: {
          id: attachmentId,
          complaintId,
          uploadedByUserId: user.id,
          storageKey,
          originalFilename: image.filename,
          contentType: image.contentType,
          sizeBytes: file.size,
        },
      });
      await this.audit(
        user.id,
        complaint.societyId,
        'complaint.attachment.upload',
        attachment.id,
        { complaintId },
      );
      return toAttachmentDto(attachment);
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async downloadAttachment(
    user: AuthenticatedUser,
    attachmentId: string,
  ): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
  }> {
    const attachment = await this.prisma.complaintAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) {
      throw new NotFoundException({
        message: 'Attachment not found',
        code: 'NOT_FOUND',
      });
    }
    const complaint = await this.requireComplaint(attachment.complaintId);
    await this.assertCanViewComplaint(user, complaint);
    const buffer = await this.storage.get(attachment.storageKey);
    return {
      buffer,
      contentType: attachment.contentType,
      filename: safeAttachmentFilename(attachment.originalFilename),
    };
  }

  private async adminTransition(
    user: AuthenticatedUser,
    complaintId: string,
    toStatus: ComplaintStatus,
    note: string,
    extra?: Prisma.ComplaintUpdateInput,
  ): Promise<ComplaintDto> {
    const complaint = await this.requireComplaint(complaintId);
    await this.authorization.assertCanAdministerSociety(
      user,
      complaint.societyId,
    );
    if (!canTransition(complaint.status, toStatus)) {
      throw new ConflictException({
        message: `Cannot transition from ${complaint.status} to ${toStatus}`,
        code: 'INVALID_TRANSITION',
      });
    }
    return this.applyTransition(user, complaint, toStatus, note, extra);
  }

  private async applyTransition(
    user: AuthenticatedUser,
    complaint: { id: string; societyId: string; status: ComplaintStatus },
    toStatus: ComplaintStatus,
    note: string,
    extra?: Prisma.ComplaintUpdateInput,
  ): Promise<ComplaintDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.complaint.updateMany({
        where: { id: complaint.id, status: complaint.status },
        data: {
          status: toStatus,
          ...(extra as Prisma.ComplaintUpdateManyMutationInput | undefined),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          message: `Cannot transition from ${complaint.status} to ${toStatus}`,
          code: 'INVALID_TRANSITION',
        });
      }
      await tx.complaintStatusHistory.create({
        data: {
          complaintId: complaint.id,
          fromStatus: complaint.status,
          toStatus,
          changedByUserId: user.id,
          note,
        },
      });
      return tx.complaint.findUniqueOrThrow({
        where: { id: complaint.id },
        include: detailIncludes,
      });
    });

    await this.audit(
      user.id,
      complaint.societyId,
      `complaint.${toStatus.toLowerCase()}`,
      complaint.id,
    );
    return toComplaintDto(updated);
  }

  private async requireActiveResident(
    user: AuthenticatedUser,
    societyId: string,
  ) {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      throw new ForbiddenException({
        message: 'Platform owners should use a society membership to file complaints',
        code: 'FORBIDDEN',
      });
    }
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT_USER,
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'Only active residents can create complaints',
        code: 'FORBIDDEN',
      });
    }
    return membership;
  }

  private async requireComplaint(complaintId: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
      include: detailIncludes,
    });
    if (!complaint) {
      throw new NotFoundException({
        message: 'Complaint not found',
        code: 'NOT_FOUND',
      });
    }
    return complaint;
  }

  private async assertCanViewComplaint(
    user: AuthenticatedUser,
    complaint: { societyId: string; createdByUserId: string },
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.authorization.ensureSocietyExists(complaint.societyId);
      return;
    }
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: complaint.societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Complaint not found',
        code: 'NOT_FOUND',
      });
    }
    if (membership.role === MembershipRole.SOCIETY_ADMIN) return;
    if (complaint.createdByUserId !== user.id) {
      throw new NotFoundException({
        message: 'Complaint not found',
        code: 'NOT_FOUND',
      });
    }
  }

  private async assertCanModifyAttachments(
    user: AuthenticatedUser,
    complaint: { societyId: string; createdByUserId: string; status: ComplaintStatus },
  ): Promise<void> {
    await this.assertCanViewComplaint(user, complaint);
    if (complaint.status === ComplaintStatus.CLOSED) {
      throw new ConflictException({
        message: 'Attachments cannot be added to a closed complaint',
        code: 'CONFLICT',
      });
    }
    const isAdmin = await this.isSocietyAdmin(user, complaint.societyId);
    if (!isAdmin && complaint.createdByUserId !== user.id) {
      throw new ForbiddenException({
        message: 'You cannot attach files to this complaint',
        code: 'FORBIDDEN',
      });
    }
  }

  private async isSocietyAdmin(
    user: AuthenticatedUser,
    societyId: string,
    membershipRole?: MembershipRole,
  ): Promise<boolean> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) return true;
    if (membershipRole === MembershipRole.SOCIETY_ADMIN) return true;
    const admin = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.SOCIETY_ADMIN,
      },
      select: { id: true },
    });
    return Boolean(admin);
  }

  private async audit(
    actorUserId: string,
    societyId: string,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        societyId,
        actorUserId,
        action,
        entityType: 'complaint',
        entityId,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }
}
