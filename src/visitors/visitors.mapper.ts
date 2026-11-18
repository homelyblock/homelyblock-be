import type {
  Visitor,
  VisitorEntryType,
  VisitorStatus,
} from '../generated/prisma/client.js';

export type VisitorDto = {
  id: string;
  societyId: string;
  buildingId: string;
  unitId: string;
  unitNumber?: string;
  buildingCode?: string;
  visitorName: string;
  visitorPhone: string;
  purpose: string;
  expectedAt: string;
  vehicleNumber: string | null;
  notes: string | null;
  entryType: VisitorEntryType;
  status: VisitorStatus;
  createdByUserId: string;
  decisionByUserId: string | null;
  decisionAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) {
    return '****';
  }
  return `${'*'.repeat(Math.max(digits.length - 4, 4))}${digits.slice(-4)}`;
}

export function toVisitorDto(
  visitor: Visitor & {
    unit?: { unitNumber: string };
    building?: { code: string };
  },
  options?: { maskPhone?: boolean },
): VisitorDto {
  return {
    id: visitor.id,
    societyId: visitor.societyId,
    buildingId: visitor.buildingId,
    unitId: visitor.unitId,
    unitNumber: visitor.unit?.unitNumber,
    buildingCode: visitor.building?.code,
    visitorName: visitor.visitorName,
    visitorPhone: options?.maskPhone
      ? maskPhone(visitor.visitorPhone)
      : visitor.visitorPhone,
    purpose: visitor.purpose,
    expectedAt: visitor.expectedAt.toISOString(),
    vehicleNumber: visitor.vehicleNumber,
    notes: visitor.notes,
    entryType: visitor.entryType,
    status: visitor.status,
    createdByUserId: visitor.createdByUserId,
    decisionByUserId: visitor.decisionByUserId,
    decisionAt: visitor.decisionAt?.toISOString() ?? null,
    checkedInAt: visitor.checkedInAt?.toISOString() ?? null,
    checkedOutAt: visitor.checkedOutAt?.toISOString() ?? null,
    createdAt: visitor.createdAt.toISOString(),
    updatedAt: visitor.updatedAt.toISOString(),
  };
}
