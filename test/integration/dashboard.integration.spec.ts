import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { ComplaintsService } from '../../src/complaints/complaints.service.js';
import { DashboardService } from '../../src/dashboard/dashboard.service.js';
import {
  InvoiceLineType,
  MaintenanceBillStatus,
  MaintenanceBillingCycle,
  MaintenanceConfigScope,
  MaintenanceConfigStatus,
  MembershipRole,
  MembershipStatus,
  NoticeAudienceType,
  NoticeCategory,
  NoticeStatus,
  PrismaClient,
  UnitStatus,
  VisitorEntryType,
  VisitorStatus,
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
} from '../../src/generated/prisma/client.js';
import { NoticesService } from '../../src/notices/notices.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { DisabledComplaintAttachmentStorage } from '../../src/complaints/storage/disabled-complaint-attachment-storage.js';
import { VisitorsService } from '../../src/visitors/visitors.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Dashboard PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let dashboard: DashboardService;
  let complaints: ComplaintsService;
  let notices: NoticesService;

  const adminId = randomUUID();
  const residentId = randomUUID();
  const otherAdminId = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let unitAId = '';
  let buildingAId = '';

  const admin = {
    id: adminId,
    displayName: 'Dash Admin',
    email: 'dash-admin@example.com',
    platformRole: null,
  };
  const resident = {
    id: residentId,
    displayName: 'Dash Resident',
    email: 'dash-resident@example.com',
    platformRole: null,
  };
  const otherAdmin = {
    id: otherAdminId,
    displayName: 'Other Dash Admin',
    email: 'other-dash-admin@example.com',
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
    const authorization = new AuthorizationService(prismaService);
    complaints = new ComplaintsService(
      prismaService,
      authorization,
      new DisabledComplaintAttachmentStorage(),
    );
    notices = new NoticesService(prismaService, authorization);
    dashboard = new DashboardService(
      prismaService,
      authorization,
      new BillingService(prismaService, authorization),
      complaints,
      notices,
      new VisitorsService(prismaService, authorization),
    );

    await prisma.maintenancePayment.deleteMany();
    await prisma.maintenanceBillLineItem.deleteMany();
    await prisma.maintenanceBill.deleteMany();
    await prisma.maintenanceConfiguration.deleteMany();
    await prisma.complaintAttachment.deleteMany();
    await prisma.complaintComment.deleteMany();
    await prisma.complaintStatusHistory.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.noticeRead.deleteMany();
    await prisma.notice.deleteMany();
    await prisma.visitor.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        { id: adminId, displayName: admin.displayName, email: admin.email },
        {
          id: residentId,
          displayName: resident.displayName,
          email: resident.email,
        },
        {
          id: otherAdminId,
          displayName: otherAdmin.displayName,
          email: otherAdmin.email,
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Dashboard Society A' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Dashboard Society B' },
    });
    societyAId = societyA.id;
    societyBId = societyB.id;

    const building = await prisma.building.create({
      data: { societyId: societyAId, name: 'Block A', code: 'A' },
    });
    buildingAId = building.id;
    const unit = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: building.id,
        unitNumber: '101',
        status: UnitStatus.ACTIVE,
      },
    });
    unitAId = unit.id;
    await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: building.id,
        unitNumber: '102',
        status: UnitStatus.ACTIVE,
      },
    });

    await prisma.societyMembership.createMany({
      data: [
        {
          societyId: societyAId,
          userId: adminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyAId,
          userId: residentId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitAId,
        },
        {
          societyId: societyBId,
          userId: otherAdminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });

    const config = await prisma.maintenanceConfiguration.create({
      data: {
        societyId: societyAId,
        name: 'Base',
        monthlyAmount: '100.00',
        additionalAmount: '0.00',
        billingCycle: MaintenanceBillingCycle.MONTHLY,
        dueDayOfMonth: 10,
        scope: MaintenanceConfigScope.SOCIETY,
        status: MaintenanceConfigStatus.ACTIVE,
      },
    });

    await prisma.maintenanceBill.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitId: unitAId,
        configId: config.id,
        billedUserId: residentId,
        invoiceNumber: `DASH-${randomUUID().slice(0, 8)}`,
        periodYear: 2026,
        periodMonth: 10,
        periodStart: new Date('2026-10-01T00:00:00.000Z'),
        periodEnd: new Date('2026-10-31T00:00:00.000Z'),
        invoiceDate: new Date('2026-10-01T00:00:00.000Z'),
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        baseAmount: '100.00',
        additionalAmount: '0.00',
        discountAmount: '0.00',
        totalAmount: '100.00',
        paidAmount: '0.00',
        outstandingAmount: '100.00',
        status: MaintenanceBillStatus.PUBLISHED,
        lineItems: {
          create: [
            {
              description: 'Base',
              amount: '100.00',
              lineType: InvoiceLineType.BASE,
            },
          ],
        },
      },
    });

    await prisma.notice.create({
      data: {
        societyId: societyAId,
        title: 'Dash Notice',
        body: 'Hello',
        category: NoticeCategory.GENERAL,
        audienceType: NoticeAudienceType.SOCIETY,
        status: NoticeStatus.PUBLISHED,
        publishedAt: new Date(),
        createdByUserId: adminId,
      },
    });

    await prisma.visitor.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitId: unitAId,
        visitorName: 'Pending Guest',
        visitorPhone: '+919800011122',
        purpose: 'Visit',
        expectedAt: new Date(Date.now() + 86_400_000),
        entryType: VisitorEntryType.EXPECTED,
        status: VisitorStatus.PENDING,
        createdByUserId: residentId,
      },
    });

    await prisma.complaint.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitId: unitAId,
        createdByUserId: residentId,
        title: 'Leaky tap',
        description: 'Kitchen sink',
        category: ComplaintCategory.PLUMBING,
        priority: ComplaintPriority.MEDIUM,
        status: ComplaintStatus.OPEN,
      },
    });

    await prisma.auditLog.create({
      data: {
        societyId: societyAId,
        actorUserId: adminId,
        action: 'notice.publish',
        entityType: 'notice',
        entityId: randomUUID(),
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.maintenancePayment.deleteMany();
    await prisma.maintenanceBillLineItem.deleteMany();
    await prisma.maintenanceBill.deleteMany();
    await prisma.maintenanceConfiguration.deleteMany();
    await prisma.complaintAttachment.deleteMany();
    await prisma.complaintComment.deleteMany();
    await prisma.complaintStatusHistory.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.noticeRead.deleteMany();
    await prisma.notice.deleteMany();
    await prisma.visitor.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('scopes resident and admin dashboards and blocks cross-society admin', async () => {
    const residentDash = await dashboard.getResidentDashboard(
      resident,
      societyAId,
    );
    expect(residentDash.maintenance.outstandingBalance).toBe('100.00');
    expect(residentDash.notices.unreadCount).toBeGreaterThanOrEqual(1);
    expect(residentDash.visitors.pendingApprovalCount).toBeGreaterThanOrEqual(1);
    expect(residentDash.complaints.openOrInProgressCount).toBeGreaterThanOrEqual(
      1,
    );
    expect(residentDash.membership.primaryUnitId).toBe(unitAId);

    await expect(
      dashboard.getResidentDashboard(admin, societyAId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const adminDash = await dashboard.getAdminDashboard(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 10,
    });
    expect(adminDash.occupancy.totalBuildings).toBe(1);
    expect(adminDash.occupancy.occupiedUnits).toBe(1);
    expect(adminDash.occupancy.vacantUnits).toBe(1);
    expect(adminDash.maintenance.totalOutstanding).toBe('100.00');
    expect(adminDash.complaints.open).toBeGreaterThanOrEqual(1);
    expect(adminDash.visitors.pendingApprovals).toBeGreaterThanOrEqual(1);
    expect(adminDash.recentActivity.length).toBeGreaterThanOrEqual(1);

    await expect(
      dashboard.getAdminDashboard(otherAdmin, societyAId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      dashboard.getResidentDashboard(resident, societyBId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const adminAttention = await dashboard.getAttention(admin, societyAId);
    expect(adminAttention.scope).toBe('ADMIN');
    expect(adminAttention.counts.complaints).toBeGreaterThanOrEqual(1);
    expect(adminAttention.counts.visitors).toBeGreaterThanOrEqual(1);
    expect(adminAttention.counts.notices).toBeGreaterThanOrEqual(1);
    expect(adminAttention.societyId).toBe(societyAId);

    const residentAttention = await dashboard.getAttention(resident, societyAId);
    expect(residentAttention.scope).toBe('RESIDENT');
    expect(residentAttention.counts.members).toBe(0);
    expect(residentAttention.counts.complaints).toBe(0);
    expect(residentAttention.counts.visitors).toBeGreaterThanOrEqual(1);
    expect(residentAttention.counts.billing).toBeGreaterThanOrEqual(1);

    await expect(
      dashboard.getAttention(otherAdmin, societyAId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      dashboard.getAttention(resident, societyBId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moves attention counts through complaint, notice, and bill workflows', async () => {
    const adminBefore = await dashboard.getAttention(admin, societyAId);
    const residentBefore = await dashboard.getAttention(resident, societyAId);
    const complaint = await prisma.complaint.findFirstOrThrow({
      where: { societyId: societyAId, createdByUserId: residentId },
    });

    await complaints.acknowledge(admin, complaint.id);
    await complaints.start(admin, complaint.id);
    const stillOpen = await dashboard.getAttention(admin, societyAId);
    expect(stillOpen.counts.complaints).toBe(adminBefore.counts.complaints);
    expect(stillOpen.counts.visitors).toBe(adminBefore.counts.visitors);

    await complaints.resolve(admin, complaint.id, {
      resolutionNotes: 'Tap washer replaced',
    });
    const resolvedAdmin = await dashboard.getAttention(admin, societyAId);
    const resolvedResident = await dashboard.getAttention(resident, societyAId);
    expect(resolvedAdmin.counts.complaints).toBe(adminBefore.counts.complaints - 1);
    expect(resolvedResident.counts.complaints).toBe(
      residentBefore.counts.complaints + 1,
    );
    expect(resolvedAdmin.counts.visitors).toBe(adminBefore.counts.visitors);
    expect(resolvedResident.counts.billing).toBe(residentBefore.counts.billing);

    await complaints.reopen(resident, complaint.id, { note: 'It is leaking again' });
    const reopenedAdmin = await dashboard.getAttention(admin, societyAId);
    const reopenedResident = await dashboard.getAttention(resident, societyAId);
    expect(reopenedAdmin.counts.complaints).toBe(resolvedAdmin.counts.complaints + 1);
    expect(reopenedResident.counts.complaints).toBe(
      resolvedResident.counts.complaints - 1,
    );

    const notice = await prisma.notice.findFirstOrThrow({
      where: { societyId: societyAId, status: NoticeStatus.PUBLISHED },
    });
    const adminNotices = (await dashboard.getAttention(admin, societyAId)).counts
      .notices;
    await notices.markRead(resident, notice.id);
    expect((await dashboard.getAttention(resident, societyAId)).counts.notices).toBe(
      residentBefore.counts.notices - 1,
    );
    expect((await dashboard.getAttention(admin, societyAId)).counts.notices).toBe(
      adminNotices,
    );

    const bill = await prisma.maintenanceBill.findFirstOrThrow({
      where: { societyId: societyAId, unitId: unitAId },
    });
    await prisma.maintenanceBill.update({
      where: { id: bill.id },
      data: { status: MaintenanceBillStatus.PAID, outstandingAmount: '0.00' },
    });
    expect((await dashboard.getAttention(resident, societyAId)).counts.billing).toBe(
      residentBefore.counts.billing - 1,
    );
    expect((await dashboard.getAttention(admin, societyAId)).counts.billing).toBe(
      adminBefore.counts.billing,
    );
  });
});
