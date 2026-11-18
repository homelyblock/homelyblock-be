import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import { ComplaintsService } from '../../src/complaints/complaints.service.js';
import { MemoryComplaintAttachmentStorage } from '../../src/complaints/storage/memory-complaint-attachment-storage.js';
import { DisabledComplaintAttachmentStorage } from '../../src/complaints/storage/disabled-complaint-attachment-storage.js';
import {
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UnitStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Complaints PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let complaints: ComplaintsService;
  let storage: MemoryComplaintAttachmentStorage;

  const adminId = randomUUID();
  const residentId = randomUUID();
  const otherResidentId = randomUUID();
  const otherAdminId = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let buildingAId = '';
  let unitA1Id = '';
  let unitA2Id = '';

  const admin = {
    id: adminId,
    displayName: 'Admin Complaints',
    email: 'admin-complaints@example.com',
    platformRole: null,
  };
  const resident = {
    id: residentId,
    displayName: 'Resident Complaints',
    email: 'resident-complaints@example.com',
    platformRole: null,
  };
  const otherResident = {
    id: otherResidentId,
    displayName: 'Other Resident',
    email: 'other-resident-complaints@example.com',
    platformRole: null,
  };
  const otherAdmin = {
    id: otherAdminId,
    displayName: 'Other Admin',
    email: 'other-admin-complaints@example.com',
    platformRole: null,
  };

  beforeAll(async () => {
    if (!databaseUrl) return;

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
    const prismaService = prisma as unknown as PrismaService;
    storage = new MemoryComplaintAttachmentStorage();
    complaints = new ComplaintsService(
      prismaService,
      new AuthorizationService(prismaService),
      storage,
    );

    await prisma.complaintAttachment.deleteMany();
    await prisma.complaintComment.deleteMany();
    await prisma.complaintStatusHistory.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        {
          id: adminId,
          displayName: 'Admin Complaints',
          email: 'admin-complaints@example.com',
        },
        {
          id: residentId,
          displayName: 'Resident Complaints',
          email: 'resident-complaints@example.com',
        },
        {
          id: otherResidentId,
          displayName: 'Other Resident',
          email: 'other-resident-complaints@example.com',
        },
        {
          id: otherAdminId,
          displayName: 'Other Admin',
          email: 'other-admin-complaints@example.com',
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Society A Complaints', city: 'Pune', state: 'MH' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Society B Complaints', city: 'Nashik', state: 'MH' },
    });
    societyAId = societyA.id;
    societyBId = societyB.id;

    const buildingA = await prisma.building.create({
      data: { societyId: societyAId, name: 'Wing A', code: 'A' },
    });
    buildingAId = buildingA.id;

    const unitA1 = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitNumber: '101',
        status: UnitStatus.ACTIVE,
      },
    });
    const unitA2 = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitNumber: '102',
        status: UnitStatus.ACTIVE,
      },
    });
    unitA1Id = unitA1.id;
    unitA2Id = unitA2.id;

    await prisma.societyMembership.createMany({
      data: [
        {
          societyId: societyAId,
          userId: adminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyBId,
          userId: otherAdminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyAId,
          userId: residentId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitA1Id,
        },
        {
          societyId: societyAId,
          userId: otherResidentId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitA2Id,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.complaintAttachment.deleteMany();
    await prisma.complaintComment.deleteMany();
    await prisma.complaintStatusHistory.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('creates complaints for active residents with membership-derived unit', async () => {
    const created = await complaints.create(resident, societyAId, {
      title: 'Kitchen leak',
      description: 'Water dripping under the sink',
      category: ComplaintCategory.PLUMBING,
      priority: ComplaintPriority.HIGH,
    });
    expect(created.status).toBe(ComplaintStatus.OPEN);
    expect(created.unitId).toBe(unitA1Id);
    expect(created.buildingId).toBe(buildingAId);
    expect(created.statusHistory?.[0]?.toStatus).toBe(ComplaintStatus.OPEN);

    await expect(
      complaints.create(admin, societyAId, {
        title: 'Admin attempt',
        description: 'Admins are not residents',
        category: ComplaintCategory.GENERAL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces ownership and cross-society isolation', async () => {
    const list = await complaints.list(resident, societyAId, {});
    const mine = list.items[0]!;
    await expect(complaints.get(otherResident, mine.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(complaints.get(otherAdmin, mine.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const adminView = await complaints.get(admin, mine.id);
    expect(adminView.id).toBe(mine.id);
  });

  it('supports assignment, valid transitions, comments, reopen, and rejects invalid ones', async () => {
    const created = await complaints.create(resident, societyAId, {
      title: 'Lift stuck',
      description: 'Lift not responding on floor 2',
      category: ComplaintCategory.LIFT,
      priority: ComplaintPriority.URGENT,
    });

    const assigned = await complaints.assign(admin, created.id, {
      assigneeUserId: adminId,
    });
    expect(assigned.assignedToUserId).toBe(adminId);
    expect(assigned.status).toBe(ComplaintStatus.ACKNOWLEDGED);

    await expect(
      complaints.assign(admin, created.id, { assigneeUserId: otherAdminId }),
    ).rejects.toBeInstanceOf(Error);

    const started = await complaints.start(admin, created.id);
    expect(started.status).toBe(ComplaintStatus.IN_PROGRESS);

    await expect(
      complaints.acknowledge(admin, created.id),
    ).resolves.toMatchObject({ status: ComplaintStatus.ACKNOWLEDGED });

    await complaints.start(admin, created.id);
    const resolved = await complaints.resolve(admin, created.id, {
      resolutionNotes: 'Technician repaired the control panel',
    });
    expect(resolved.status).toBe(ComplaintStatus.RESOLVED);
    expect(resolved.resolutionNotes).toContain('Technician');

    await expect(
      complaints.resolve(admin, created.id, {
        resolutionNotes: 'Again',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const comment = await complaints.addComment(resident, created.id, {
      body: 'Thanks, still noisy though',
    });
    expect(comment.body).toContain('noisy');

    await expect(
      complaints.addComment(otherResident, created.id, { body: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const reopened = await complaints.reopen(resident, created.id, {
      note: 'Noise returned',
    });
    expect(reopened.status).toBe(ComplaintStatus.REOPENED);

    await complaints.start(admin, created.id);
    await complaints.resolve(admin, created.id, {
      resolutionNotes: 'Adjusted again',
    });
    const closed = await complaints.close(admin, created.id);
    expect(closed.status).toBe(ComplaintStatus.CLOSED);

    await expect(
      complaints.reopen(resident, created.id, { note: 'Closed reopen' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('calculates dashboard from database records', async () => {
    const dashboard = await complaints.getDashboard(admin, societyAId);
    expect(dashboard.total).toBeGreaterThanOrEqual(2);
    expect(dashboard.byCategory.length).toBeGreaterThan(0);
    expect(dashboard.recent.length).toBeGreaterThan(0);
    await expect(
      complaints.getDashboard(resident, societyAId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores attachments through the storage abstraction and blocks disabled storage', async () => {
    const created = await complaints.create(resident, societyAId, {
      title: 'Parking scratch',
      description: 'Vehicle scratched in visitor parking',
      category: ComplaintCategory.PARKING,
      priority: ComplaintPriority.MEDIUM,
    });

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
    ]);
    const uploaded = await complaints.addAttachment(resident, created.id, {
      originalname: 'scratch.png',
      mimetype: 'image/png',
      size: png.length,
      buffer: png,
    });
    expect(uploaded.contentType).toBe('image/png');

    const downloaded = await complaints.downloadAttachment(admin, uploaded.id);
    expect(downloaded.buffer.equals(png)).toBe(true);

    const spoofed = Buffer.from('<html></html>');
    await expect(
      complaints.addAttachment(resident, created.id, {
        originalname: 'page.png',
        mimetype: 'image/png',
        size: spoofed.length,
        buffer: spoofed,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await expect(
      complaints.addAttachment(resident, created.id, {
        originalname: 'photo.png',
        mimetype: 'image/jpeg',
        size: jpeg.length,
        buffer: jpeg,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(
      complaints.addAttachment(resident, created.id, {
        originalname: 'photo.jpg',
        mimetype: 'image/png',
        size: png.length,
        buffer: png,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    await expect(
      complaints.addAttachment(resident, created.id, {
        originalname: 'gate.webp\r\nSet-Cookie: x',
        mimetype: 'image/webp',
        size: webp.length,
        buffer: webp,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    const named = await complaints.addAttachment(resident, created.id, {
      originalname: 'gate.webp',
      mimetype: 'image/webp',
      size: webp.length,
      buffer: webp,
    });
    expect(named.originalFilename).toBe('gate.webp');
    expect(named.contentType).toBe('image/webp');

    await expect(
      complaints.downloadAttachment(otherResident, uploaded.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const disabled = new ComplaintsService(
      prisma as unknown as PrismaService,
      new AuthorizationService(prisma as unknown as PrismaService),
      new DisabledComplaintAttachmentStorage(),
    );
    await expect(
      disabled.addAttachment(resident, created.id, {
        originalname: 'x.jpg',
        mimetype: 'image/jpeg',
        size: 4,
        buffer: Buffer.from('abcd'),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
