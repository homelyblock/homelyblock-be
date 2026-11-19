import type { BillingDashboardDto } from '../billing/billing.mapper.js';
import type { ComplaintDashboardDto } from '../complaints/complaints.mapper.js';
import type {
  ComplaintStatus,
  MembershipRole,
  MembershipStatus,
  NoticeStatus,
  VisitorStatus,
} from '../generated/prisma/client.js';

export type AttentionCounts = {
  complaints: number;
  members: number;
  visitors: number;
  notices: number;
  billing: number;
};

export type AttentionDto = {
  societyId: string;
  scope: 'ADMIN' | 'RESIDENT';
  counts: AttentionCounts;
};

export type DashboardActivityItem = {
  id: string;
  type: string;
  title: string;
  occurredAt: string;
  hrefHint?: string;
};

export type ResidentDashboardDto = {
  role: 'RESIDENT';
  society: {
    id: string;
    name: string;
    status: string;
  };
  membership: {
    id: string;
    role: MembershipRole;
    status: MembershipStatus;
    primaryUnitId: string | null;
    unitNumber: string | null;
    buildingName: string | null;
    buildingCode: string | null;
  };
  notices: {
    unreadCount: number;
    recent: Array<{
      id: string;
      title: string;
      category: string;
      publishedAt: string | null;
      isRead: boolean;
    }>;
  };
  maintenance: {
    outstandingBalance: string;
    openBills: Array<{
      id: string;
      invoiceNumber: string;
      status: string;
      outstandingAmount: string;
      dueDate: string;
      periodYear: number;
      periodMonth: number;
    }>;
    recentPayments: Array<{
      id: string;
      billId: string;
      amount: string;
      paidAt: string;
      method: string;
      status: string;
    }>;
  };
  complaints: {
    openOrInProgressCount: number;
    recent: Array<{
      id: string;
      title: string;
      status: ComplaintStatus;
      category: string;
      createdAt: string;
    }>;
  };
  visitors: {
    pendingApprovalCount: number;
    recentExpected: Array<{
      id: string;
      visitorName: string;
      status: VisitorStatus;
      expectedAt: string | null;
    }>;
  };
  quickActions: string[];
  recentActivity: DashboardActivityItem[];
};

export type AdminDashboardDto = {
  role: 'ADMIN';
  society: {
    id: string;
    name: string;
    status: string;
  };
  occupancy: {
    totalBuildings: number;
    totalUnits: number;
    activeUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    activeResidentMemberships: number;
    activeAdminMemberships: number;
    activeHouseholdMembers: number;
    /** Occupied = distinct primaryUnitId among ACTIVE memberships. */
    occupancyDefinition: string;
  };
  maintenance: BillingDashboardDto & {
    periodYear: number | null;
    periodMonth: number | null;
  };
  complaints: ComplaintDashboardDto;
  visitors: {
    pendingApprovals: number;
    checkedIn: number;
    recent: Array<{
      id: string;
      visitorName: string;
      status: VisitorStatus;
      expectedAt: string | null;
      createdAt: string;
    }>;
  };
  notices: {
    draftCount: number;
    publishedCount: number;
    recent: Array<{
      id: string;
      title: string;
      status: NoticeStatus;
      publishedAt: string | null;
      createdAt: string;
    }>;
  };
  quickActions: string[];
  recentActivity: DashboardActivityItem[];
};
