import type {
  InvoiceLineType,
  MaintenanceBill,
  MaintenanceBillLineItem,
  MaintenanceBillStatus,
  MaintenanceBillingCycle,
  MaintenanceConfigScope,
  MaintenanceConfigStatus,
  MaintenanceConfiguration,
  MaintenancePayment,
  PaymentMethod,
  PaymentRecordStatus,
} from '../generated/prisma/client.js';
import { moneyString, type Money } from './money.js';

export type MaintenanceConfigDto = {
  id: string;
  societyId: string;
  name: string;
  description: string | null;
  monthlyAmount: string;
  billingCycle: MaintenanceBillingCycle;
  dueDayOfMonth: number;
  additionalAmount: string;
  additionalDescription: string | null;
  scope: MaintenanceConfigScope;
  targetBuildingId: string | null;
  targetUnitId: string | null;
  status: MaintenanceConfigStatus;
  createdAt: string;
  updatedAt: string;
};

export type BillLineItemDto = {
  id: string;
  description: string;
  amount: string;
  lineType: InvoiceLineType;
};

export type BillDto = {
  id: string;
  societyId: string;
  buildingId: string;
  unitId: string;
  configId: string | null;
  billedUserId: string | null;
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  periodStart: string;
  periodEnd: string;
  invoiceDate: string;
  dueDate: string;
  baseAmount: string;
  additionalAmount: string;
  discountAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: MaintenanceBillStatus;
  unitNumber?: string;
  buildingCode?: string;
  lineItems?: BillLineItemDto[];
  createdAt: string;
  updatedAt: string;
};

export type PaymentDto = {
  id: string;
  societyId: string;
  billId: string;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  referenceNumber: string | null;
  notes: string | null;
  status: PaymentRecordStatus;
  idempotencyKey: string;
  recordedByUserId: string;
  reversedAt: string | null;
  reversedByUserId: string | null;
  reversalReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerateBillsResultDto = {
  items: BillDto[];
  createdCount: number;
  alreadyExisting: number;
  skippedIneligible: number;
  failed: Array<{ unitId: string; unitNumber?: string; reason: string }>;
  /** @deprecated Prefer alreadyExisting */
  skippedExisting: number;
};

export type BillingDashboardDto = {
  totalBilled: string;
  totalCollected: string;
  totalOutstanding: string;
  overdueAmount: string;
  paidInvoiceCount: number;
  partiallyPaidInvoiceCount: number;
  unpaidInvoiceCount: number;
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toConfigDto(
  config: MaintenanceConfiguration,
): MaintenanceConfigDto {
  return {
    id: config.id,
    societyId: config.societyId,
    name: config.name,
    description: config.description,
    monthlyAmount: moneyString(config.monthlyAmount as Money),
    billingCycle: config.billingCycle,
    dueDayOfMonth: config.dueDayOfMonth,
    additionalAmount: moneyString(config.additionalAmount as Money),
    additionalDescription: config.additionalDescription,
    scope: config.scope,
    targetBuildingId: config.targetBuildingId,
    targetUnitId: config.targetUnitId,
    status: config.status,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function toBillDto(
  bill: MaintenanceBill & {
    unit?: { unitNumber: string };
    building?: { code: string };
    lineItems?: MaintenanceBillLineItem[];
  },
): BillDto {
  return {
    id: bill.id,
    societyId: bill.societyId,
    buildingId: bill.buildingId,
    unitId: bill.unitId,
    configId: bill.configId,
    billedUserId: bill.billedUserId,
    invoiceNumber: bill.invoiceNumber,
    periodYear: bill.periodYear,
    periodMonth: bill.periodMonth,
    periodStart: dateOnly(bill.periodStart),
    periodEnd: dateOnly(bill.periodEnd),
    invoiceDate: dateOnly(bill.invoiceDate),
    dueDate: dateOnly(bill.dueDate),
    baseAmount: moneyString(bill.baseAmount as Money),
    additionalAmount: moneyString(bill.additionalAmount as Money),
    discountAmount: moneyString(bill.discountAmount as Money),
    totalAmount: moneyString(bill.totalAmount as Money),
    paidAmount: moneyString(bill.paidAmount as Money),
    outstandingAmount: moneyString(bill.outstandingAmount as Money),
    status: bill.status,
    unitNumber: bill.unit?.unitNumber,
    buildingCode: bill.building?.code,
    lineItems: bill.lineItems?.map((item) => ({
      id: item.id,
      description: item.description,
      amount: moneyString(item.amount as Money),
      lineType: item.lineType,
    })),
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

export function toPaymentDto(payment: MaintenancePayment): PaymentDto {
  return {
    id: payment.id,
    societyId: payment.societyId,
    billId: payment.billId,
    amount: moneyString(payment.amount as Money),
    method: payment.method,
    paidAt: payment.paidAt.toISOString(),
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    status: payment.status,
    idempotencyKey: payment.idempotencyKey,
    recordedByUserId: payment.recordedByUserId,
    reversedAt: payment.reversedAt?.toISOString() ?? null,
    reversedByUserId: payment.reversedByUserId,
    reversalReason: payment.reversalReason,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}
