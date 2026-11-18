import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import {
  MaintenanceBillStatus,
  MembershipRole,
  MembershipStatus,
  PaymentMethod,
  PaymentRecordStatus,
  PrismaClient,
  UnitStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Billing PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let billing: BillingService;

  const adminId = randomUUID();
  const residentId = randomUUID();
  const otherAdminId = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let buildingAId = '';
  let unitA1Id = '';
  let unitA2Id = '';
  let configId = '';

  const admin = {
    id: adminId,
    displayName: 'Admin Billing',
    email: 'admin-billing@example.com',
    platformRole: null,
  };
  const resident = {
    id: residentId,
    displayName: 'Resident Billing',
    email: 'resident-billing@example.com',
    platformRole: null,
  };
  const otherAdmin = {
    id: otherAdminId,
    displayName: 'Other Admin',
    email: 'other-admin-billing@example.com',
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
    billing = new BillingService(
      prismaService,
      new AuthorizationService(prismaService),
    );

    await prisma.maintenancePayment.deleteMany();
    await prisma.maintenanceBillLineItem.deleteMany();
    await prisma.maintenanceBill.deleteMany();
    await prisma.maintenanceConfiguration.deleteMany();
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
          displayName: 'Admin Billing',
          email: 'admin-billing@example.com',
        },
        {
          id: residentId,
          displayName: 'Resident Billing',
          email: 'resident-billing@example.com',
        },
        {
          id: otherAdminId,
          displayName: 'Other Admin',
          email: 'other-admin-billing@example.com',
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Society A Billing', city: 'Pune', state: 'MH' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Society B Billing', city: 'Nashik', state: 'MH' },
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
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.maintenancePayment.deleteMany();
    await prisma.maintenanceBillLineItem.deleteMany();
    await prisma.maintenanceBill.deleteMany();
    await prisma.maintenanceConfiguration.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('configures billing and generates draft bills without duplicates', async () => {
    // dueDayOfMonth must be on/after "today" in UTC for PUBLISHED assertions;
    // overdue refresh flips earlier due dates and breaks payment/cancel flows.
    const config = await billing.createConfig(admin, societyAId, {
      name: 'Monthly',
      monthlyAmount: '1500.00',
      dueDayOfMonth: 28,
      additionalAmount: '100.50',
      additionalDescription: 'Sinking fund',
    });
    configId = config.id;
    expect(config.monthlyAmount).toBe('1500.00');

    await expect(
      billing.createConfig(otherAdmin, societyAId, {
        name: 'Hack',
        monthlyAmount: '1',
        dueDayOfMonth: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const generated = await billing.generateBills(admin, societyAId, {
      configId,
      periodYear: 2026,
      periodMonth: 11,
    });
    expect(generated.items).toHaveLength(2);
    expect(generated.items[0]?.status).toBe(MaintenanceBillStatus.DRAFT);
    expect(generated.items[0]?.totalAmount).toBe('1600.50');

    const again = await billing.generateBills(admin, societyAId, {
      configId,
      periodYear: 2026,
      periodMonth: 11,
    });
    expect(again.items).toHaveLength(0);
    expect(again.createdCount).toBe(0);
    expect(again.alreadyExisting).toBe(2);
    expect(again.skippedExisting).toBe(2);
  });

  it('publishes bills, records partial payments, prevents overpay, and reverses', async () => {
    await billing.publishPeriod(admin, societyAId, 2026, 11);
    const list = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA1Id,
    });
    const bill = list.items[0];
    expect(bill).toBeTruthy();
    expect(bill!.status).toBe(MaintenanceBillStatus.PUBLISHED);

    const first = await billing.recordPayment(admin, bill!.id, {
      idempotencyKey: 'pay-partial-u1-001',
      amount: '600.00',
      method: PaymentMethod.UPI,
      paidAt: new Date().toISOString(),
      referenceNumber: 'UPI-1',
    });
    expect(first.bill.status).toBe(MaintenanceBillStatus.PARTIALLY_PAID);
    expect(first.bill.outstandingAmount).toBe('1000.50');

    await expect(
      billing.recordPayment(admin, bill!.id, {
        idempotencyKey: 'pay-over-u1-001',
        amount: '2000.00',
        method: PaymentMethod.CASH,
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const second = await billing.recordPayment(admin, bill!.id, {
      idempotencyKey: 'pay-final-u1-001',
      amount: '1000.50',
      method: PaymentMethod.BANK_TRANSFER,
      paidAt: new Date().toISOString(),
    });
    expect(second.bill.status).toBe(MaintenanceBillStatus.PAID);
    expect(second.bill.outstandingAmount).toBe('0.00');

    const reversed = await billing.reversePayment(admin, first.payment.id, {
      reason: 'Duplicate correction',
    });
    expect(reversed.payment.status).toBe(PaymentRecordStatus.REVERSED);
    expect(reversed.bill.status).toBe(MaintenanceBillStatus.PARTIALLY_PAID);

    await expect(
      billing.reversePayment(admin, first.payment.id, {
        reason: 'Again',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      billing.recordPayment(admin, bill!.id, {
        idempotencyKey: 'pay-naive-u1-001',
        amount: '1.00',
        method: PaymentMethod.CASH,
        paidAt: '2026-01-16T00:00:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const india = await billing.recordPayment(admin, bill!.id, {
      idempotencyKey: 'pay-india-u1-001',
      amount: '1.00',
      method: PaymentMethod.UPI,
      paidAt: '2026-01-16T00:00:00+05:30',
    });
    expect(india.payment.paidAt).toBe('2026-01-15T18:30:00.000Z');

    const payments = await billing.listPaymentsForBill(admin, bill!.id);
    expect(payments).toHaveLength(3);
    expect(payments.some((p) => p.status === PaymentRecordStatus.REVERSED)).toBe(
      true,
    );
  });

  it('enforces payment idempotency for retries, conflicts, and concurrent keys', async () => {
    const list = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA2Id,
    });
    const bill = list.items[0]!;
    if (bill.status === MaintenanceBillStatus.DRAFT) {
      await billing.publishBill(admin, bill.id);
    }

    const paidAt = '2026-11-15T10:00:00.000Z';
    const payload = {
      idempotencyKey: 'idem-shared-u2-001',
      amount: '100.00',
      method: PaymentMethod.UPI,
      paidAt,
      referenceNumber: 'IDEMP-1',
    };

    const first = await billing.recordPayment(admin, bill.id, payload);
    const retry = await billing.recordPayment(admin, bill.id, payload);
    expect(retry.payment.id).toBe(first.payment.id);
    expect(retry.bill.paidAmount).toBe(first.bill.paidAmount);

    await expect(
      billing.recordPayment(admin, bill.id, {
        ...payload,
        amount: '150.00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const otherKey = await billing.recordPayment(admin, bill.id, {
      idempotencyKey: 'idem-shared-u2-002',
      amount: '50.00',
      method: PaymentMethod.CASH,
      paidAt: '2026-11-16T10:00:00.000Z',
    });
    expect(otherKey.payment.id).not.toBe(first.payment.id);

    const concurrentKey = 'idem-concurrent-u2-001';
    const concurrentPayload = {
      idempotencyKey: concurrentKey,
      amount: '25.00',
      method: PaymentMethod.CHEQUE,
      paidAt: '2026-11-17T10:00:00.000Z',
    };
    const [a, b] = await Promise.all([
      billing.recordPayment(admin, bill.id, concurrentPayload),
      billing.recordPayment(admin, bill.id, concurrentPayload),
    ]);
    expect(a.payment.id).toBe(b.payment.id);

    const paymentCount = await prisma.maintenancePayment.count({
      where: {
        billId: bill.id,
        idempotencyKey: concurrentKey,
        status: PaymentRecordStatus.RECORDED,
      },
    });
    expect(paymentCount).toBe(1);

    await expect(
      billing.recordPayment(resident, bill.id, {
        idempotencyKey: 'resident-forbidden-001',
        amount: '10.00',
        method: PaymentMethod.CASH,
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('handles failed payment transaction then successful retry with same key', async () => {
    const list = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA2Id,
    });
    const bill = list.items[0]!;
    const key = 'idem-retry-after-fail-001';
    const paidAt = '2026-11-18T12:00:00.000Z';

    await expect(
      billing.recordPayment(admin, bill.id, {
        idempotencyKey: key,
        amount: '999999.00',
        method: PaymentMethod.CASH,
        paidAt,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const created = await billing.recordPayment(admin, bill.id, {
      idempotencyKey: key,
      amount: '10.00',
      method: PaymentMethod.CASH,
      paidAt,
    });
    expect(created.payment.amount).toBe('10.00');
    expect(created.payment.idempotencyKey).toBe(key);
  });

  it('generates concurrently without duplicate open bills for the same period', async () => {
    const periodYear = 2026;
    const periodMonth = 12;
    const [first, second] = await Promise.all([
      billing.generateBills(admin, societyAId, {
        configId,
        periodYear,
        periodMonth,
      }),
      billing.generateBills(admin, societyAId, {
        configId,
        periodYear,
        periodMonth,
      }),
    ]);

    const createdTotal = first.createdCount + second.createdCount;
    expect(createdTotal).toBe(2);
    expect(first.failed).toEqual([]);
    expect(second.failed).toEqual([]);

    const openBills = await prisma.maintenanceBill.findMany({
      where: {
        societyId: societyAId,
        periodYear,
        periodMonth,
        status: { not: MaintenanceBillStatus.CANCELLED },
      },
    });
    expect(openBills).toHaveLength(2);
    const unitIds = new Set(openBills.map((row) => row.unitId));
    expect(unitIds.size).toBe(2);

    const retry = await billing.generateBills(admin, societyAId, {
      configId,
      periodYear,
      periodMonth,
    });
    expect(retry.createdCount).toBe(0);
    expect(retry.alreadyExisting).toBe(2);
  });

  it('builds authorized invoice PDFs from server-side bill data', async () => {
    const list = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA1Id,
    });
    const bill = list.items[0]!;
    const pdf = await billing.getInvoicePdf(admin, bill.id);
    expect(pdf.filename).toContain(bill.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_'));
    expect(pdf.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');

    const residentPdf = await billing.getInvoicePdf(resident, bill.id);
    expect(residentPdf.buffer.length).toBeGreaterThan(500);

    const otherUnit = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA2Id,
    });
    await expect(
      billing.getInvoicePdf(resident, otherUnit.items[0]!.id),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      billing.getInvoicePdf(otherAdmin, bill.id),
    ).rejects.toBeInstanceOf(Error);
  });

  it('scopes resident bill access and dashboard numbers', async () => {
    const residentList = await billing.listBills(resident, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
    });
    expect(residentList.items.every((item) => item.unitId === unitA1Id)).toBe(
      true,
    );
    expect(
      residentList.items.every(
        (item) => item.status !== MaintenanceBillStatus.DRAFT,
      ),
    ).toBe(true);

    await expect(
      billing.listBills(resident, societyAId, { unitId: unitA2Id }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const dashboard = await billing.getDashboard(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
    });
    expect(Number(dashboard.totalBilled)).toBeGreaterThan(0);
    expect(dashboard.partiallyPaidInvoiceCount).toBeGreaterThanOrEqual(1);

    await expect(
      billing.getDashboard(resident, societyAId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves historical totals when config changes', async () => {
    await billing.updateConfig(admin, configId, {
      monthlyAmount: '9999.00',
    });
    const list = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA2Id,
    });
    expect(list.items[0]?.baseAmount).toBe('1500.00');
    expect(list.items[0]?.totalAmount).toBe('1600.50');
  });

  it('blocks cancelling bills that have payments', async () => {
    const list = await billing.listBills(admin, societyAId, {
      periodYear: 2026,
      periodMonth: 11,
      unitId: unitA1Id,
    });
    await expect(billing.cancelBill(admin, list.items[0]!.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
