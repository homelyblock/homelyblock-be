import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { BillingService } from '../billing/billing.service.js';
import { money, moneyString } from '../billing/money.js';
import { ComplaintsService } from '../complaints/complaints.service.js';
import {
  ComplaintStatus,
  MaintenanceBillStatus,
  MembershipRole,
  MembershipStatus,
  NoticeAudienceType,
  NoticeStatus,
  PaymentRecordStatus,
  PlatformRole,
  UnitStatus,
  VisitorStatus,
} from '../generated/prisma/client.js';
import { NoticesService } from '../notices/notices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VisitorsService } from '../visitors/visitors.service.js';
import type {
  AdminDashboardDto,
  AttentionDto,
  DashboardActivityItem,
  ResidentDashboardDto,
} from './dashboard.types.js';

const RESIDENT_QUICK_ACTIONS = [
  'create_expected_visitor',
  'submit_complaint',
  'view_notices',
  'view_bills',
  'manage_household',
] as const;

const ADMIN_QUICK_ACTIONS = [
  'add_resident',
  'add_building_unit',
  'create_notice',
  'generate_bills',
  'view_complaints',
  'view_visitors',
] as const;

const ADMIN_ACTIVITY_ACTIONS = [
  'notice.publish',
  'visitor.approve',
  'visitor.check_in',
  'visitor.check_out',
  'complaint.create',
  'complaint.open',
  'complaint.acknowledged',
  'complaint.in_progress',
  'complaint.resolved',
  'complaint.closed',
  'complaint.reopened',
  'maintenance_bill.publish',
  'maintenance_bills.publish_period',
  'maintenance_payment.record',
  'membership.create',
  'membership.update',
] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly billing: BillingService,
    private readonly complaints: ComplaintsService,
    private readonly notices: NoticesService,
    private readonly visitors: VisitorsService,
  ) {}

  async getResidentDashboard(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<ResidentDashboardDto> {
    const membership = await this.requireActiveMembership(user, societyId);
    if (membership.role !== MembershipRole.RESIDENT_USER) {
      throw new ForbiddenException({
        message:
          'Resident dashboard requires an ACTIVE RESIDENT_USER membership in this society',
        code: 'FORBIDDEN',
      });
    }

    const society = await this.requireSociety(societyId);
    const primaryUnitId = membership.primaryUnitId;

    const [noticesPage, billsPage, complaintsPage, pendingVisitors, expectedVisitors] =
      await Promise.all([
        this.notices.list(user, societyId, { page: 1, limit: 5 }),
        this.billing.listBills(user, societyId, { page: 1, limit: 50 }),
        this.complaints.list(user, societyId, { page: 1, limit: 5 }),
        this.visitors.list(user, societyId, {
          page: 1,
          limit: 1,
          status: VisitorStatus.PENDING,
        }),
        this.visitors.list(user, societyId, { page: 1, limit: 5 }),
      ]);

    const unreadTotal = await this.countUnreadNotices(user.id, societyId);

    let outstanding = money('0');
    const openBills = [];
    for (const bill of billsPage.items) {
      if (
        bill.status === MaintenanceBillStatus.PUBLISHED ||
        bill.status === MaintenanceBillStatus.PARTIALLY_PAID ||
        bill.status === MaintenanceBillStatus.OVERDUE
      ) {
        outstanding = outstanding.plus(money(bill.outstandingAmount));
        openBills.push({
          id: bill.id,
          invoiceNumber: bill.invoiceNumber,
          status: bill.status,
          outstandingAmount: bill.outstandingAmount,
          dueDate: bill.dueDate,
          periodYear: bill.periodYear,
          periodMonth: bill.periodMonth,
        });
      }
    }

    const recentPayments = primaryUnitId
      ? await this.prisma.maintenancePayment.findMany({
          where: {
            societyId,
            status: PaymentRecordStatus.RECORDED,
            bill: { unitId: primaryUnitId },
          },
          orderBy: { paidAt: 'desc' },
          take: 5,
          select: {
            id: true,
            billId: true,
            amount: true,
            paidAt: true,
            method: true,
            status: true,
          },
        })
      : [];

    const openOrInProgressCount = await this.prisma.complaint.count({
      where: {
        societyId,
        createdByUserId: user.id,
        status: {
          in: [
            ComplaintStatus.OPEN,
            ComplaintStatus.ACKNOWLEDGED,
            ComplaintStatus.REOPENED,
            ComplaintStatus.IN_PROGRESS,
          ],
        },
      },
    });

    const recentActivity = this.buildResidentActivity({
      notices: noticesPage.items,
      complaints: complaintsPage.items,
      visitors: expectedVisitors.items,
      payments: recentPayments,
    });

    return {
      role: 'RESIDENT',
      society: {
        id: society.id,
        name: society.name,
        status: society.status,
      },
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status,
        primaryUnitId,
        unitNumber: membership.primaryUnit?.unitNumber ?? null,
        buildingName: membership.primaryUnit?.building.name ?? null,
        buildingCode: membership.primaryUnit?.building.code ?? null,
      },
      notices: {
        unreadCount: unreadTotal,
        recent: noticesPage.items.map((n) => ({
          id: n.id,
          title: n.title,
          category: n.category,
          publishedAt: n.publishedAt,
          isRead: Boolean(n.isRead),
        })),
      },
      maintenance: {
        outstandingBalance: moneyString(outstanding.toDecimalPlaces(2)),
        openBills: openBills.slice(0, 8),
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          billId: p.billId,
          amount: moneyString(money(p.amount)),
          paidAt: p.paidAt.toISOString(),
          method: p.method,
          status: p.status,
        })),
      },
      complaints: {
        openOrInProgressCount,
        recent: complaintsPage.items.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          category: c.category,
          createdAt: c.createdAt,
        })),
      },
      visitors: {
        pendingApprovalCount: pendingVisitors.total,
        recentExpected: expectedVisitors.items.map((v) => ({
          id: v.id,
          visitorName: v.visitorName,
          status: v.status,
          expectedAt: v.expectedAt,
        })),
      },
      quickActions: [...RESIDENT_QUICK_ACTIONS],
      recentActivity,
    };
  }

  async getAdminDashboard(
    user: AuthenticatedUser,
    societyId: string,
    period?: { periodYear?: number; periodMonth?: number },
  ): Promise<AdminDashboardDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const society = await this.requireSociety(societyId);

    const now = new Date();
    const periodYear = period?.periodYear ?? now.getUTCFullYear();
    const periodMonth = period?.periodMonth ?? now.getUTCMonth() + 1;

    const [
      maintenance,
      complaints,
      totalBuildings,
      totalUnits,
      activeUnits,
      occupiedUnitRows,
      activeResidentMemberships,
      activeAdminMemberships,
      activeHouseholdMembers,
      pendingApprovals,
      checkedIn,
      recentVisitors,
      draftCount,
      publishedCount,
      recentNotices,
      activity,
    ] = await Promise.all([
      this.billing.getDashboard(user, societyId, {
        periodYear,
        periodMonth,
      }),
      this.complaints.getDashboard(user, societyId),
      this.prisma.building.count({ where: { societyId } }),
      this.prisma.unit.count({ where: { societyId } }),
      this.prisma.unit.count({
        where: { societyId, status: UnitStatus.ACTIVE },
      }),
      this.prisma.societyMembership.findMany({
        where: {
          societyId,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: { not: null },
        },
        select: { primaryUnitId: true },
        distinct: ['primaryUnitId'],
      }),
      this.prisma.societyMembership.count({
        where: {
          societyId,
          status: MembershipStatus.ACTIVE,
          role: MembershipRole.RESIDENT_USER,
        },
      }),
      this.prisma.societyMembership.count({
        where: {
          societyId,
          status: MembershipStatus.ACTIVE,
          role: MembershipRole.SOCIETY_ADMIN,
        },
      }),
      this.prisma.householdMember.count({
        where: {
          isActive: true,
          membership: {
            societyId,
            status: MembershipStatus.ACTIVE,
          },
        },
      }),
      this.prisma.visitor.count({
        where: { societyId, status: VisitorStatus.PENDING },
      }),
      this.prisma.visitor.count({
        where: { societyId, status: VisitorStatus.CHECKED_IN },
      }),
      this.prisma.visitor.findMany({
        where: { societyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          visitorName: true,
          status: true,
          expectedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notice.count({
        where: { societyId, status: NoticeStatus.DRAFT },
      }),
      this.prisma.notice.count({
        where: { societyId, status: NoticeStatus.PUBLISHED },
      }),
      this.prisma.notice.findMany({
        where: { societyId },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      this.listAdminActivity(societyId, 15),
    ]);

    const occupiedUnits = occupiedUnitRows.length;
    const vacantUnits = Math.max(activeUnits - occupiedUnits, 0);

    return {
      role: 'ADMIN',
      society: {
        id: society.id,
        name: society.name,
        status: society.status,
      },
      occupancy: {
        totalBuildings,
        totalUnits,
        activeUnits,
        occupiedUnits,
        vacantUnits,
        activeResidentMemberships,
        activeAdminMemberships,
        activeHouseholdMembers,
        occupancyDefinition:
          'Occupied units = distinct primary_unit_id values among ACTIVE society memberships. Vacant = ACTIVE units minus occupied. Multiple ACTIVE memberships on the same unit count once. Units without a primary membership are vacant even if inactive household rows exist.',
      },
      maintenance: {
        ...maintenance,
        periodYear,
        periodMonth,
      },
      complaints,
      visitors: {
        pendingApprovals,
        checkedIn,
        recent: recentVisitors.map((v) => ({
          id: v.id,
          visitorName: v.visitorName,
          status: v.status,
          expectedAt: v.expectedAt.toISOString(),
          createdAt: v.createdAt.toISOString(),
        })),
      },
      notices: {
        draftCount,
        publishedCount,
        recent: recentNotices.map((n) => ({
          id: n.id,
          title: n.title,
          status: n.status,
          publishedAt: n.publishedAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
      },
      quickActions: [...ADMIN_QUICK_ACTIONS],
      recentActivity: activity,
    };
  }

  async getAttention(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<AttentionDto> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin =
      user.platformRole === PlatformRole.PLATFORM_OWNER ||
      membership?.role === MembershipRole.SOCIETY_ADMIN;

    if (isAdmin) {
      const [complaints, members, visitors, notices, billing] =
        await Promise.all([
          this.prisma.complaint.count({
            where: {
              societyId,
              status: {
                in: [
                  ComplaintStatus.OPEN,
                  ComplaintStatus.ACKNOWLEDGED,
                  ComplaintStatus.IN_PROGRESS,
                  ComplaintStatus.REOPENED,
                ],
              },
            },
          }),
          this.prisma.societyMembership.count({
            where: { societyId, status: MembershipStatus.INVITED },
          }),
          this.prisma.visitor.count({
            where: { societyId, status: VisitorStatus.PENDING },
          }),
          this.prisma.notice.count({
            where: {
              societyId,
              status: NoticeStatus.PUBLISHED,
              reads: { none: { userId: user.id } },
            },
          }),
          this.prisma.maintenanceBill.count({
            where: { societyId, status: MaintenanceBillStatus.OVERDUE },
          }),
        ]);

      return {
        societyId,
        scope: 'ADMIN',
        counts: { complaints, members, visitors, notices, billing },
      };
    }

    if (!membership || membership.role !== MembershipRole.RESIDENT_USER) {
      throw new ForbiddenException({
        message: 'You do not have permission to access this society',
        code: 'FORBIDDEN',
      });
    }

    const home = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT_USER,
      },
      select: { primaryUnitId: true },
    });
    if (!home) {
      throw new ForbiddenException({
        message: 'You do not have an active membership in this society',
        code: 'FORBIDDEN',
      });
    }

    const [complaints, visitors, notices, billing] = await Promise.all([
      this.prisma.complaint.count({
        where: {
          societyId,
          createdByUserId: user.id,
          status: ComplaintStatus.RESOLVED,
        },
      }),
      this.prisma.visitor.count({
        where: {
          societyId,
          createdByUserId: user.id,
          status: VisitorStatus.PENDING,
        },
      }),
      this.countUnreadNotices(user.id, societyId),
      home.primaryUnitId
        ? this.prisma.maintenanceBill.count({
            where: {
              societyId,
              unitId: home.primaryUnitId,
              status: {
                in: [
                  MaintenanceBillStatus.PUBLISHED,
                  MaintenanceBillStatus.PARTIALLY_PAID,
                  MaintenanceBillStatus.OVERDUE,
                ],
              },
            },
          })
        : Promise.resolve(0),
    ]);

    return {
      societyId,
      scope: 'RESIDENT',
      counts: {
        complaints,
        members: 0,
        visitors,
        notices,
        billing,
      },
    };
  }

  async getActivity(
    user: AuthenticatedUser,
    societyId: string,
    limit = 15,
  ): Promise<{ items: DashboardActivityItem[]; role: 'ADMIN' | 'RESIDENT' }> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin =
      user.platformRole === PlatformRole.PLATFORM_OWNER ||
      membership?.role === MembershipRole.SOCIETY_ADMIN;

    const take = Math.min(Math.max(limit, 1), 30);
    if (isAdmin) {
      return {
        role: 'ADMIN',
        items: await this.listAdminActivity(societyId, take),
      };
    }

    const resident = await this.getResidentDashboard(user, societyId);
    return {
      role: 'RESIDENT',
      items: resident.recentActivity.slice(0, take),
    };
  }

  private async listAdminActivity(
    societyId: string,
    take: number,
  ): Promise<DashboardActivityItem[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        societyId,
        action: { in: [...ADMIN_ACTIVITY_ACTIONS] },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.action,
      title: formatAuditTitle(row.action, row.entityType),
      occurredAt: row.createdAt.toISOString(),
      hrefHint: hrefHintFor(row.action, row.entityType, row.entityId),
    }));
  }

  private async countUnreadNotices(
    userId: string,
    societyId: string,
  ): Promise<number> {
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId,
        societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        primaryUnitId: true,
        primaryUnit: { select: { buildingId: true } },
      },
    });
    const buildingId = membership?.primaryUnit?.buildingId ?? null;
    const unitId = membership?.primaryUnitId ?? null;

    const audienceFilters = [
      { audienceType: NoticeAudienceType.SOCIETY },
      ...(buildingId
        ? [
            {
              audienceType: NoticeAudienceType.BUILDING,
              targetBuildingId: buildingId,
            },
          ]
        : []),
      ...(unitId
        ? [
            {
              audienceType: NoticeAudienceType.UNIT,
              targetUnitId: unitId,
            },
          ]
        : []),
    ];

    return this.prisma.notice.count({
      where: {
        societyId,
        status: NoticeStatus.PUBLISHED,
        OR: audienceFilters,
        reads: { none: { userId } },
      },
    });
  }

  private buildResidentActivity(input: {
    notices: Array<{
      id: string;
      title: string;
      publishedAt: string | null;
      createdAt: string;
      isRead?: boolean;
    }>;
    complaints: Array<{
      id: string;
      title: string;
      createdAt: string;
      status: ComplaintStatus;
    }>;
    visitors: Array<{
      id: string;
      visitorName: string;
      expectedAt: string | null;
      createdAt: string;
      status: VisitorStatus;
    }>;
    payments: Array<{
      id: string;
      billId: string;
      amount: string | number | Parameters<typeof money>[0];
      paidAt: Date;
    }>;
  }): DashboardActivityItem[] {
    const items: DashboardActivityItem[] = [];

    for (const n of input.notices) {
      items.push({
        id: `notice:${n.id}`,
        type: 'notice.published',
        title: n.isRead ? `Notice: ${n.title}` : `Unread notice: ${n.title}`,
        occurredAt: n.publishedAt ?? n.createdAt,
        hrefHint: `notice:${n.id}`,
      });
    }
    for (const c of input.complaints) {
      items.push({
        id: `complaint:${c.id}`,
        type: 'complaint.recent',
        title: `Complaint (${c.status}): ${c.title}`,
        occurredAt: c.createdAt,
        hrefHint: `complaint:${c.id}`,
      });
    }
    for (const v of input.visitors) {
      items.push({
        id: `visitor:${v.id}`,
        type: 'visitor.recent',
        title: `Visitor (${v.status}): ${v.visitorName}`,
        occurredAt: v.expectedAt ?? v.createdAt,
        hrefHint: `visitor:${v.id}`,
      });
    }
    for (const p of input.payments) {
      items.push({
        id: `payment:${p.id}`,
        type: 'payment.recorded',
        title: `Payment recorded: ${moneyString(money(p.amount))}`,
        occurredAt: p.paidAt.toISOString(),
        hrefHint: `bill:${p.billId}`,
      });
    }

    return items
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )
      .slice(0, 15);
  }

  private async requireSociety(societyId: string) {
    const society = await this.prisma.society.findUnique({
      where: { id: societyId },
      select: { id: true, name: true, status: true },
    });
    if (!society) {
      throw new NotFoundException({
        message: 'Society not found',
        code: 'NOT_FOUND',
      });
    }
    return society;
  }

  private async requireActiveMembership(
    user: AuthenticatedUser,
    societyId: string,
  ) {
    await this.authorization.assertCanViewSociety(user, societyId);
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        id: true,
        role: true,
        status: true,
        primaryUnitId: true,
        primaryUnit: {
          select: {
            unitNumber: true,
            building: { select: { name: true, code: true } },
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'You do not have an active membership in this society',
        code: 'FORBIDDEN',
      });
    }
    return membership;
  }
}

function formatAuditTitle(action: string, entityType: string): string {
  return `${action.replaceAll('.', ' ')} (${entityType})`;
}

function hrefHintFor(
  action: string,
  entityType: string,
  entityId: string,
): string {
  if (entityType === 'notice' || action.startsWith('notice.')) {
    return `notice:${entityId}`;
  }
  if (entityType === 'visitor' || action.startsWith('visitor.')) {
    return `visitor:${entityId}`;
  }
  if (entityType === 'complaint' || action.startsWith('complaint.')) {
    return `complaint:${entityId}`;
  }
  if (action.includes('payment') || action.includes('bill')) {
    return `billing`;
  }
  if (entityType === 'society_membership') {
    return `members`;
  }
  return entityType;
}
