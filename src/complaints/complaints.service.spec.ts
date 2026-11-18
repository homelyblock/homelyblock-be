import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplaintsService } from './complaints.service.js';
import { MemoryComplaintAttachmentStorage } from './storage/memory-complaint-attachment-storage.js';

describe('ComplaintsService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const complaintId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const unitId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const buildingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const resident: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Resident',
    email: 'r@example.com',
    platformRole: null,
  };
  const admin: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Admin',
    email: 'a@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const assertCanViewSociety = vi.fn();
  const ensureSocietyExists = vi.fn();
  const membershipFindFirst = vi.fn();
  const complaintFindUnique = vi.fn();
  const transaction = vi.fn();

  let service: ComplaintsService;

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    assertCanViewSociety.mockReset();
    ensureSocietyExists.mockReset();
    membershipFindFirst.mockReset();
    complaintFindUnique.mockReset();
    transaction.mockReset();

    service = new ComplaintsService(
      {
        societyMembership: { findFirst: membershipFindFirst },
        complaint: { findUnique: complaintFindUnique },
        complaintComment: { create: vi.fn(), findMany: vi.fn() },
        complaintAttachment: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        unit: { findFirst: vi.fn() },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
        assertCanViewSociety,
        ensureSocietyExists,
      } as unknown as AuthorizationService,
      new MemoryComplaintAttachmentStorage(),
    );
  });

  it('rejects complaint creation without active resident membership', async () => {
    membershipFindFirst.mockResolvedValue(null);
    await expect(
      service.create(resident, societyId, {
        title: 'Leak',
        description: 'Kitchen sink leak',
        category: ComplaintCategory.PLUMBING,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid status transitions', async () => {
    assertCanAdministerSociety.mockResolvedValue(undefined);
    complaintFindUnique.mockResolvedValue({
      id: complaintId,
      societyId,
      buildingId,
      unitId,
      createdByUserId: resident.id,
      assignedToUserId: null,
      title: 'Leak',
      description: 'Kitchen sink leak',
      category: ComplaintCategory.PLUMBING,
      priority: ComplaintPriority.MEDIUM,
      status: ComplaintStatus.OPEN,
      resolutionNotes: null,
      resolvedAt: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      unit: { unitNumber: '101' },
      building: { code: 'A' },
      createdBy: { displayName: 'Resident' },
      assignedTo: null,
      statusHistory: [],
      comments: [],
      attachments: [],
    });

    await expect(service.resolve(admin, complaintId, {
      resolutionNotes: 'Fixed',
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
