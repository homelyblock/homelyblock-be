import type {
  Complaint,
  ComplaintAttachment,
  ComplaintCategory,
  ComplaintComment,
  ComplaintPriority,
  ComplaintStatus,
  ComplaintStatusHistory,
} from '../generated/prisma/client.js';

export type ComplaintDto = {
  id: string;
  societyId: string;
  buildingId: string;
  unitId: string;
  createdByUserId: string;
  assignedToUserId: string | null;
  title: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unitNumber?: string;
  buildingCode?: string;
  createdByDisplayName?: string;
  assignedToDisplayName?: string;
  statusHistory?: ComplaintStatusHistoryDto[];
  comments?: ComplaintCommentDto[];
  attachments?: ComplaintAttachmentDto[];
};

export type ComplaintStatusHistoryDto = {
  id: string;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus;
  changedByUserId: string;
  changedByDisplayName?: string;
  note: string | null;
  createdAt: string;
};

export type ComplaintCommentDto = {
  id: string;
  complaintId: string;
  authorUserId: string;
  authorDisplayName?: string;
  body: string;
  createdAt: string;
};

export type ComplaintAttachmentDto = {
  id: string;
  complaintId: string;
  uploadedByUserId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ComplaintDashboardDto = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  highOrUrgent: number;
  byCategory: Array<{ category: ComplaintCategory; count: number }>;
  recent: ComplaintDto[];
};

type ComplaintWithRelations = Complaint & {
  unit?: { unitNumber: string };
  building?: { code: string };
  createdBy?: { displayName: string };
  assignedTo?: { displayName: string } | null;
  statusHistory?: Array<
    ComplaintStatusHistory & { changedBy?: { displayName: string } }
  >;
  comments?: Array<ComplaintComment & { author?: { displayName: string } }>;
  attachments?: ComplaintAttachment[];
};

export function toComplaintDto(complaint: ComplaintWithRelations): ComplaintDto {
  return {
    id: complaint.id,
    societyId: complaint.societyId,
    buildingId: complaint.buildingId,
    unitId: complaint.unitId,
    createdByUserId: complaint.createdByUserId,
    assignedToUserId: complaint.assignedToUserId,
    title: complaint.title,
    description: complaint.description,
    category: complaint.category,
    priority: complaint.priority,
    status: complaint.status,
    resolutionNotes: complaint.resolutionNotes,
    resolvedAt: complaint.resolvedAt?.toISOString() ?? null,
    closedAt: complaint.closedAt?.toISOString() ?? null,
    createdAt: complaint.createdAt.toISOString(),
    updatedAt: complaint.updatedAt.toISOString(),
    unitNumber: complaint.unit?.unitNumber,
    buildingCode: complaint.building?.code,
    createdByDisplayName: complaint.createdBy?.displayName,
    assignedToDisplayName: complaint.assignedTo?.displayName ?? undefined,
    statusHistory: complaint.statusHistory?.map(toHistoryDto),
    comments: complaint.comments?.map(toCommentDto),
    attachments: complaint.attachments?.map(toAttachmentDto),
  };
}

export function toHistoryDto(
  row: ComplaintStatusHistory & { changedBy?: { displayName: string } },
): ComplaintStatusHistoryDto {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedByUserId: row.changedByUserId,
    changedByDisplayName: row.changedBy?.displayName,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCommentDto(
  row: ComplaintComment & { author?: { displayName: string } },
): ComplaintCommentDto {
  return {
    id: row.id,
    complaintId: row.complaintId,
    authorUserId: row.authorUserId,
    authorDisplayName: row.author?.displayName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAttachmentDto(
  row: ComplaintAttachment,
): ComplaintAttachmentDto {
  return {
    id: row.id,
    complaintId: row.complaintId,
    uploadedByUserId: row.uploadedByUserId,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}
