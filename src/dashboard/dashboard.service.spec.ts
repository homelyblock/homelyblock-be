import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { BillingService } from '../billing/billing.service.js';
import { ComplaintsService } from '../complaints/complaints.service.js';
import {
  ComplaintStatus,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  VisitorStatus,
} from '../generated/prisma/client.js';
import { NoticesService } from '../notices/notices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VisitorsService } from '../visitors/visitors.service.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const unitId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

  const assertCanViewSociety = vi.fn();
  const assertCanAdministerSociety = vi.fn();
  const membershipFindFirst = vi.fn();
  const societyFindUnique = vi.fn();
  const buildingCount = vi.fn();
  const unitCount = vi.fn();
  const membershipFindMany = vi.fn();
  const membershipCount = vi.fn();
  const householdCount = vi.fn();
  const visitorCount = vi.fn();
  const visitorFindMany = vi.fn();
  const noticeCount = vi.fn();
  const noticeFindMany = vi.fn();
  const auditFindMany = vi.fn();
  const paymentFindMany = vi.fn();
  const complaintCount = vi.fn();
  const billCount = vi.fn();

  const billingGetDashboard = vi.fn();
  const billingListBills = vi.fn();
  const billingSumOutstanding = vi.fn();
  const complaintsGetDashboard = vi.fn();
  const complaintsList = vi.fn();
  const noticesList = vi.fn();
  const visitorsList = vi.fn();

  let service: DashboardService;

  beforeEach(() => {
    for (const fn of [
      assertCanViewSociety,
      assertCanAdministerSociety,
      membershipFindFirst,
      societyFindUnique,
      buildingCount,
      unitCount,
      membershipFindMany,
      membershipCount,
      householdCount,
      visitorCount,
      visitorFindMany,
      noticeCount,
      noticeFindMany,
      auditFindMany,
      paymentFindMany,
      complaintCount,
      billCount,
      billingGetDashboard,
      billingListBills,
      billingSumOutstanding,
      complaintsGetDashboard,
      complaintsList,
      noticesList,
      visitorsList,
    ]) {
      fn.mockReset();
    }

    service = new DashboardService(
      {
        society: { findUnique: societyFindUnique },
        societyMembership: {
          findFirst: membershipFindFirst,
          findMany: membershipFindMany,
          count: membershipCount,
        },
        building: { count: buildingCount },
        unit: { count: unitCount },
        householdMember: { count: householdCount },
        visitor: { count: visitorCount, findMany: visitorFindMany },
        notice: { count: noticeCount, findMany: noticeFindMany },
        auditLog: { findMany: auditFindMany },
        maintenancePayment: { findMany: paymentFindMany },
        complaint: { count: complaintCount },
        maintenanceBill: { count: billCount },
      } as unknown as PrismaService,
      {
        assertCanViewSociety,
        assertCanAdministerSociety,
      } as unknown as AuthorizationService,
      {
        getDashboard: billingGetDashboard,
        listBills: billingListBills,
        sumOutstandingForUnit: billingSumOutstanding,
      } as unknown as BillingService,
      {
        getDashboard: complaintsGetDashboard,
        list: complaintsList,
      } as unknown as ComplaintsService,
      { list: noticesList } as unknown as NoticesService,
      { list: visitorsList } as unknown as VisitorsService,
    );
  });

  it('rejects non-residents from the resident dashboard', async () => {
    assertCanViewSociety.mockResolvedValue({
      id: 'm1',
      role: MembershipRole.SOCIETY_ADMIN,
    });
    membershipFindFirst.mockResolvedValue({
      id: 'm1',
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: unitId,
      primaryUnit: {
        unitNumber: '101',
        building: { name: 'A', code: 'A' },
      },
    });

    await expect(
      service.getResidentDashboard(admin, societyId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aggregates resident outstanding balance with Decimal-safe strings', async () => {
    assertCanViewSociety.mockResolvedValue({
      id: 'm1',
      role: MembershipRole.RESIDENT_USER,
      primaryUnitId: unitId,
    });
    membershipFindFirst
      .mockResolvedValueOnce({
        id: 'm1',
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.ACTIVE,
        primaryUnitId: unitId,
        primaryUnit: {
          unitNumber: '101',
          building: { name: 'Tower', code: 'T1' },
        },
      })
      .mockResolvedValueOnce({
        primaryUnitId: unitId,
        primaryUnit: { buildingId: 'b1' },
      });
    societyFindUnique.mockResolvedValue({
      id: societyId,
      name: 'Green Society',
      status: 'ACTIVE',
    });
    noticesList.mockResolvedValue({ items: [], page: 1, limit: 5, total: 0 });
    noticeFindMany.mockResolvedValue([]);
    billingListBills.mockResolvedValue({
      items: [
        {
          id: 'bill1',
          invoiceNumber: 'INV-1',
          status: 'PUBLISHED',
          outstandingAmount: '100.50',
          dueDate: '2026-11-01',
          periodYear: 2026,
          periodMonth: 10,
        },
        {
          id: 'bill2',
          invoiceNumber: 'INV-2',
          status: 'PARTIALLY_PAID',
          outstandingAmount: '49.50',
          dueDate: '2026-10-01',
          periodYear: 2026,
          periodMonth: 9,
        },
        {
          id: 'bill3',
          invoiceNumber: 'INV-3',
          status: 'PAID',
          outstandingAmount: '0.00',
          dueDate: '2026-09-01',
          periodYear: 2026,
          periodMonth: 8,
        },
      ],
      page: 1,
      limit: 50,
      total: 3,
    });
    billingSumOutstanding.mockResolvedValue('150.00');
    complaintsList.mockResolvedValue({ items: [], page: 1, limit: 5, total: 0 });
    visitorsList
      .mockResolvedValueOnce({ items: [], page: 1, limit: 1, total: 2 })
      .mockResolvedValueOnce({ items: [], page: 1, limit: 5, total: 0 });
    paymentFindMany.mockResolvedValue([]);
    complaintCount.mockResolvedValue(1);

    const result = await service.getResidentDashboard(resident, societyId);
    expect(result.maintenance.outstandingBalance).toBe('150.00');
    expect(result.maintenance.openBills).toHaveLength(2);
    expect(result.visitors.pendingApprovalCount).toBe(2);
    expect(result.complaints.openOrInProgressCount).toBe(1);
    expect(result.quickActions).toContain('submit_complaint');
  });

  it('builds admin occupancy from distinct primary units and reuses billing dashboard', async () => {
    assertCanAdministerSociety.mockResolvedValue(undefined);
    societyFindUnique.mockResolvedValue({
      id: societyId,
      name: 'Green Society',
      status: 'ACTIVE',
    });
    billingGetDashboard.mockResolvedValue({
      totalBilled: '1000.00',
      totalCollected: '400.00',
      totalOutstanding: '600.00',
      overdueAmount: '100.00',
      paidInvoiceCount: 1,
      partiallyPaidInvoiceCount: 1,
      unpaidInvoiceCount: 2,
    });
    complaintsGetDashboard.mockResolvedValue({
      total: 3,
      open: 1,
      inProgress: 1,
      resolved: 1,
      highOrUrgent: 0,
      byCategory: [],
      recent: [],
    });
    buildingCount.mockResolvedValue(2);
    unitCount.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    membershipFindMany.mockResolvedValue([
      { primaryUnitId: 'u1' },
      { primaryUnitId: 'u2' },
      { primaryUnitId: 'u3' },
    ]);
    membershipCount.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    householdCount.mockResolvedValue(4);
    visitorCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    visitorFindMany.mockResolvedValue([]);
    noticeCount.mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    noticeFindMany.mockResolvedValue([]);
    auditFindMany.mockResolvedValue([
      {
        id: 'a1',
        action: 'notice.publish',
        entityType: 'notice',
        entityId: 'n1',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.getAdminDashboard(admin, societyId, {
      periodYear: 2026,
      periodMonth: 10,
    });

    expect(result.occupancy.occupiedUnits).toBe(3);
    expect(result.occupancy.vacantUnits).toBe(5);
    expect(result.occupancy.activeHouseholdMembers).toBe(4);
    expect(result.maintenance.totalOutstanding).toBe('600.00');
    expect(result.maintenance.periodYear).toBe(2026);
    expect(billingGetDashboard).toHaveBeenCalledWith(admin, societyId, {
      periodYear: 2026,
      periodMonth: 10,
    });
    expect(result.recentActivity[0]?.type).toBe('notice.publish');
  });

  it('allows platform owners on admin dashboard', async () => {
    const owner: AuthenticatedUser = {
      ...admin,
      platformRole: PlatformRole.PLATFORM_OWNER,
    };
    assertCanAdministerSociety.mockResolvedValue(undefined);
    societyFindUnique.mockResolvedValue({
      id: societyId,
      name: 'Green Society',
      status: 'ACTIVE',
    });
    billingGetDashboard.mockResolvedValue({
      totalBilled: '0.00',
      totalCollected: '0.00',
      totalOutstanding: '0.00',
      overdueAmount: '0.00',
      paidInvoiceCount: 0,
      partiallyPaidInvoiceCount: 0,
      unpaidInvoiceCount: 0,
    });
    complaintsGetDashboard.mockResolvedValue({
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      highOrUrgent: 0,
      byCategory: [],
      recent: [],
    });
    buildingCount.mockResolvedValue(0);
    unitCount.mockResolvedValue(0);
    membershipFindMany.mockResolvedValue([]);
    membershipCount.mockResolvedValue(0);
    householdCount.mockResolvedValue(0);
    visitorCount.mockResolvedValue(0);
    visitorFindMany.mockResolvedValue([]);
    noticeCount.mockResolvedValue(0);
    noticeFindMany.mockResolvedValue([]);
    auditFindMany.mockResolvedValue([]);

    const result = await service.getAdminDashboard(owner, societyId);
    expect(result.role).toBe('ADMIN');
    expect(result.occupancy.totalBuildings).toBe(0);
  });

  it('scopes activity role for admins vs residents', async () => {
    assertCanViewSociety.mockResolvedValue({
      role: MembershipRole.SOCIETY_ADMIN,
    });
    auditFindMany.mockResolvedValue([]);
    const adminActivity = await service.getActivity(admin, societyId, 5);
    expect(adminActivity.role).toBe('ADMIN');

    assertCanViewSociety.mockResolvedValue({
      role: MembershipRole.RESIDENT_USER,
      primaryUnitId: unitId,
    });
    membershipFindFirst
      .mockResolvedValueOnce({
        id: 'm1',
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.ACTIVE,
        primaryUnitId: unitId,
        primaryUnit: {
          unitNumber: '101',
          building: { name: 'Tower', code: 'T1' },
        },
      })
      .mockResolvedValueOnce({
        primaryUnitId: unitId,
        primaryUnit: { buildingId: 'b1' },
      });
    societyFindUnique.mockResolvedValue({
      id: societyId,
      name: 'Green Society',
      status: 'ACTIVE',
    });
    noticesList.mockResolvedValue({ items: [], page: 1, limit: 5, total: 0 });
    noticeFindMany.mockResolvedValue([]);
    billingListBills.mockResolvedValue({
      items: [],
      page: 1,
      limit: 50,
      total: 0,
    });
    complaintsList.mockResolvedValue({ items: [], page: 1, limit: 5, total: 0 });
    visitorsList.mockResolvedValue({
      items: [
        {
          id: 'v1',
          visitorName: 'Guest',
          status: VisitorStatus.APPROVED,
          expectedAt: '2026-10-30T10:00:00.000Z',
          createdAt: '2026-10-29T10:00:00.000Z',
        },
      ],
      page: 1,
      limit: 5,
      total: 1,
    });
    paymentFindMany.mockResolvedValue([]);
    complaintCount.mockResolvedValue(0);

    const residentActivity = await service.getActivity(resident, societyId, 5);
    expect(residentActivity.role).toBe('RESIDENT');
  });

  it('scopes admin attention counts to the society and role', async () => {
    assertCanViewSociety.mockResolvedValue({
      id: 'm-admin',
      role: MembershipRole.SOCIETY_ADMIN,
      primaryUnitId: null,
    });
    complaintCount.mockResolvedValue(3);
    membershipCount.mockResolvedValue(2);
    visitorCount.mockResolvedValue(1);
    noticeCount.mockResolvedValue(4);
    billCount.mockResolvedValue(5);

    const result = await service.getAttention(admin, societyId);

    expect(result.scope).toBe('ADMIN');
    expect(result.counts).toEqual({
      complaints: 3,
      members: 2,
      visitors: 1,
      notices: 4,
      billing: 5,
    });
    expect(complaintCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        societyId,
        status: {
          in: expect.arrayContaining([ComplaintStatus.OPEN, ComplaintStatus.REOPENED]),
        },
      }),
    });
    expect(JSON.stringify(complaintCount.mock.calls[0]?.[0])).not.toContain(
      admin.id,
    );
  });

  it('scopes resident attention to their own unresolved responses and home', async () => {
    assertCanViewSociety.mockResolvedValue({
      id: 'm1',
      role: MembershipRole.RESIDENT_USER,
      primaryUnitId: unitId,
    });
    membershipFindFirst.mockResolvedValue({
      primaryUnitId: unitId,
      primaryUnit: { buildingId: 'b1' },
    });
    noticeCount.mockResolvedValue(1);
    complaintCount.mockResolvedValue(1);
    visitorCount.mockResolvedValue(2);
    billCount.mockResolvedValue(3);

    const result = await service.getAttention(resident, societyId);

    expect(result.scope).toBe('RESIDENT');
    expect(result.counts).toEqual({
      complaints: 1,
      members: 0,
      visitors: 2,
      notices: 1,
      billing: 3,
    });
    expect(complaintCount).toHaveBeenCalledWith({
      where: {
        societyId,
        createdByUserId: resident.id,
        status: ComplaintStatus.RESOLVED,
      },
    });
    expect(billCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        societyId,
        unitId,
      }),
    });
    expect(noticeCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        societyId,
        reads: { none: { userId: resident.id } },
      }),
    });
    const noticeWhere = noticeCount.mock.calls.at(-1)?.[0] as {
      where: { OR: Array<{ audienceType: string }> };
    };
    expect(noticeWhere.where.OR.map((item) => item.audienceType)).toEqual([
      'SOCIETY',
      'BUILDING',
      'UNIT',
    ]);
  });

  it('counts platform-owner attention as admin for that society only', async () => {
    const owner: AuthenticatedUser = {
      ...admin,
      platformRole: PlatformRole.PLATFORM_OWNER,
    };
    assertCanViewSociety.mockResolvedValue(null);
    complaintCount.mockResolvedValue(2);
    membershipCount.mockResolvedValue(1);
    visitorCount.mockResolvedValue(0);
    noticeCount.mockResolvedValue(0);
    billCount.mockResolvedValue(0);

    const result = await service.getAttention(owner, societyId);

    expect(result.scope).toBe('ADMIN');
    expect(assertCanViewSociety).toHaveBeenCalledWith(owner, societyId);
    expect(JSON.stringify(complaintCount.mock.calls[0]?.[0])).not.toContain(owner.id);
  });

  it('does not return attention for a society the caller cannot view', async () => {
    assertCanViewSociety.mockRejectedValue(new ForbiddenException());
    await expect(service.getAttention(resident, societyId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(complaintCount).not.toHaveBeenCalled();
  });
});
