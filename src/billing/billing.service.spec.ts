import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MaintenanceBillStatus,
  MaintenanceConfigScope,
  MaintenanceConfigStatus,
  MembershipRole,
  MembershipStatus,
  PaymentMethod,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from './billing.service.js';

describe('BillingService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const configId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const billId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const buildingId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'a@example.com',
    platformRole: null,
  };
  const resident: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Resident',
    email: 'r@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const assertCanViewSociety = vi.fn();
  const ensureSocietyExists = vi.fn();
  const configCreate = vi.fn();
  const configFindUnique = vi.fn();
  const configFindMany = vi.fn();
  const configUpdate = vi.fn();
  const billFindUnique = vi.fn();
  const billUpdate = vi.fn();
  const billUpdateMany = vi.fn();
  const paymentCreate = vi.fn();
  const paymentFindUnique = vi.fn();
  const paymentUpdate = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();

  let service: BillingService;

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    assertCanViewSociety.mockReset().mockResolvedValue({
      id: 'm1',
      societyId,
      userId: admin.id,
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      primaryUnitId: null,
    });
    ensureSocietyExists.mockReset().mockResolvedValue(undefined);
    for (const fn of [
      configCreate,
      configFindUnique,
      configFindMany,
      configUpdate,
      billFindUnique,
      billUpdate,
      billUpdateMany,
      paymentCreate,
      paymentFindUnique,
      paymentUpdate,
      auditCreate,
      transaction,
    ]) {
      fn.mockReset();
    }
    auditCreate.mockResolvedValue({});
    billUpdateMany.mockResolvedValue({ count: 0 });

    service = new BillingService(
      {
        maintenanceConfiguration: {
          create: configCreate,
          findUnique: configFindUnique,
          findMany: configFindMany,
          update: configUpdate,
        },
        maintenanceBill: {
          findUnique: billFindUnique,
          update: billUpdate,
          updateMany: billUpdateMany,
        },
        maintenancePayment: {
          create: paymentCreate,
          findUnique: paymentFindUnique,
          update: paymentUpdate,
        },
        auditLog: { create: auditCreate },
        $transaction: transaction,
        building: { findFirst: vi.fn() },
        unit: { findFirst: vi.fn(), findMany: vi.fn() },
        societyMembership: { findFirst: vi.fn(), findMany: vi.fn() },
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
        assertCanViewSociety,
        ensureSocietyExists,
      } as unknown as AuthorizationService,
    );
  });

  it('creates society-scoped maintenance configs with decimal amounts', async () => {
    configCreate.mockResolvedValue({
      id: configId,
      societyId,
      name: 'Standard',
      description: null,
      monthlyAmount: new Prisma.Decimal('1500.00'),
      billingCycle: 'MONTHLY',
      dueDayOfMonth: 10,
      additionalAmount: new Prisma.Decimal('0.00'),
      additionalDescription: null,
      scope: MaintenanceConfigScope.SOCIETY,
      targetBuildingId: null,
      targetUnitId: null,
      status: MaintenanceConfigStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createConfig(admin, societyId, {
      name: 'Standard',
      monthlyAmount: '1500.00',
      dueDayOfMonth: 10,
    });

    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(result.monthlyAmount).toBe('1500.00');
  });

  it('does not store a payment time that has no timezone offset', async () => {
    billFindUnique.mockResolvedValue({
      id: billId,
      societyId,
      buildingId,
      unitId,
      status: MaintenanceBillStatus.PUBLISHED,
      totalAmount: new Prisma.Decimal('1000.00'),
      paidAmount: new Prisma.Decimal('0.00'),
      outstandingAmount: new Prisma.Decimal('1000.00'),
      dueDate: new Date('2099-01-01'),
      unit: { unitNumber: '101' },
      building: { code: 'A' },
      lineItems: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      baseAmount: new Prisma.Decimal('1000'),
      additionalAmount: new Prisma.Decimal('0'),
      discountAmount: new Prisma.Decimal('0'),
      configId,
      billedUserId: null,
      invoiceNumber: 'INV-1',
      periodYear: 2026,
      periodMonth: 10,
      periodStart: new Date(),
      periodEnd: new Date(),
      invoiceDate: new Date(),
    });

    await expect(
      service.recordPayment(admin, billId, {
        idempotencyKey: 'idem-offset-001',
        amount: '100.00',
        method: PaymentMethod.UPI,
        paidAt: '2026-01-16T00:00:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects overpayment', async () => {
    paymentFindUnique.mockResolvedValue(null);
    billFindUnique.mockResolvedValue({
      id: billId,
      societyId,
      buildingId,
      unitId,
      status: MaintenanceBillStatus.PUBLISHED,
      totalAmount: new Prisma.Decimal('1000.00'),
      paidAmount: new Prisma.Decimal('800.00'),
      outstandingAmount: new Prisma.Decimal('200.00'),
      dueDate: new Date('2099-01-01'),
      unit: { unitNumber: '101' },
      building: { code: 'A' },
      lineItems: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      baseAmount: new Prisma.Decimal('1000'),
      additionalAmount: new Prisma.Decimal('0'),
      discountAmount: new Prisma.Decimal('0'),
      configId,
      billedUserId: null,
      invoiceNumber: 'INV-1',
      periodYear: 2026,
      periodMonth: 10,
      periodStart: new Date(),
      periodEnd: new Date(),
      invoiceDate: new Date(),
    });

    await expect(
      service.recordPayment(admin, billId, {
        idempotencyKey: 'idem-overpay-001',
        amount: '250.00',
        method: PaymentMethod.UPI,
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payments on draft bills', async () => {
    paymentFindUnique.mockResolvedValue(null);
    billFindUnique.mockResolvedValue({
      id: billId,
      societyId,
      status: MaintenanceBillStatus.DRAFT,
      outstandingAmount: new Prisma.Decimal('100'),
      paidAmount: new Prisma.Decimal('0'),
      totalAmount: new Prisma.Decimal('100'),
      dueDate: new Date(),
      unit: { unitNumber: '101' },
      building: { code: 'A' },
      lineItems: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      buildingId,
      unitId,
      baseAmount: new Prisma.Decimal('100'),
      additionalAmount: new Prisma.Decimal('0'),
      discountAmount: new Prisma.Decimal('0'),
      configId,
      billedUserId: null,
      invoiceNumber: 'INV-1',
      periodYear: 2026,
      periodMonth: 10,
      periodStart: new Date(),
      periodEnd: new Date(),
      invoiceDate: new Date(),
    });

    await expect(
      service.recordPayment(admin, billId, {
        idempotencyKey: 'idem-draft-001',
        amount: '50.00',
        method: PaymentMethod.CASH,
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('denies residents from creating configs', async () => {
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());
    await expect(
      service.createConfig(resident, societyId, {
        name: 'X',
        monthlyAmount: '100',
        dueDayOfMonth: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
