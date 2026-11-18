import type {
  Notice,
  NoticeAudienceType,
  NoticeCategory,
  NoticeStatus,
} from '../generated/prisma/client.js';

export type NoticeDto = {
  id: string;
  societyId: string;
  title: string;
  body: string;
  category: NoticeCategory;
  audienceType: NoticeAudienceType;
  targetBuildingId: string | null;
  targetUnitId: string | null;
  status: NoticeStatus;
  createdByUserId: string;
  createdByDisplayName?: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRead?: boolean;
  readAt?: string | null;
};

export function toNoticeDto(
  notice: Notice & { createdBy?: { displayName: string } },
  options?: { isRead?: boolean; readAt?: Date | null },
): NoticeDto {
  const dto: NoticeDto = {
    id: notice.id,
    societyId: notice.societyId,
    title: notice.title,
    body: notice.body,
    category: notice.category,
    audienceType: notice.audienceType,
    targetBuildingId: notice.targetBuildingId,
    targetUnitId: notice.targetUnitId,
    status: notice.status,
    createdByUserId: notice.createdByUserId,
    publishedAt: notice.publishedAt?.toISOString() ?? null,
    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  };

  if (notice.createdBy) {
    dto.createdByDisplayName = notice.createdBy.displayName;
  }
  if (options?.isRead !== undefined) {
    dto.isRead = options.isRead;
    dto.readAt = options.readAt?.toISOString() ?? null;
  }

  return dto;
}
