import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  InvoiceLineType,
  MaintenanceBillStatus,
  MaintenanceBillingCycle,
  MaintenanceConfigScope,
  MaintenanceConfigStatus,
  MembershipRole,
  MembershipStatus,
  PaymentRecordStatus,
  PlatformRole,
  Prisma,
  UnitStatus,
} from '../generated/prisma/client.js';
import { parseExplicitInstant } from '../common/instant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMaintenanceConfigDto } from './dto/create-maintenance-config.dto.js';
import type { GenerateBillsDto } from './dto/generate-bills.dto.js';
import type { ListBillsQueryDto } from './dto/list-bills-query.dto.js';
import type { RecordPaymentDto } from './dto/record-payment.dto.js';
import type { ReversePaymentDto } from './dto/reverse-payment.dto.js';
import type { UpdateMaintenanceConfigDto } from './dto/update-maintenance-config.dto.js';
import {
  toBillDto,
  toConfigDto,
  toPaymentDto,
  type BillDto,
  type BillingDashboardDto,
  type GenerateBillsResultDto,
  type MaintenanceConfigDto,
  type PaymentDto,
} from './billing.mapper.js';
import { buildInvoicePdf } from './invoice-pdf.js';
import {
  assertNonNegative,
  assertPositive,
  computeTotal,
  money,
  moneyString,
  type Money,
} from './money.js';

export type PaginatedBills = {
  items: BillDto[];
  page: number;
  limit: number;
  total: number;
};

const billIncludes = {
  unit: { select: { unitNumber: true } },
  building: { select: { code: true } },
  lineItems: true,
} as const;

const OPEN_BILL_STATUSES: MaintenanceBillStatus[] = [
  MaintenanceBillStatus.DRAFT,
  MaintenanceBillStatus.PUBLISHED,
  MaintenanceBillStatus.PARTIALLY_PAID,
  MaintenanceBillStatus.PAID,
  MaintenanceBillStatus.OVERDUE,
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async createConfig(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateMaintenanceConfigDto,
  ): Promise<MaintenanceConfigDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const scope = dto.scope ?? MaintenanceConfigScope.SOCIETY;
    const targets = await this.resolveConfigScope(societyId, scope, {
      targetBuildingId: dto.targetBuildingId,
      targetUnitId: dto.targetUnitId,
    });
    const monthlyAmount = money(dto.monthlyAmount);
    assertPositive(monthlyAmount, 'monthlyAmount');
    const additionalAmount = money(dto.additionalAmount ?? '0');
    assertNonNegative(additionalAmount, 'additionalAmount');

    const config = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenanceConfiguration.create({
        data: {
          societyId,
          name: dto.name.trim(),
          description: optionalTrim(dto.description),
          monthlyAmount,
          billingCycle: MaintenanceBillingCycle.MONTHLY,
          dueDayOfMonth: dto.dueDayOfMonth,
          additionalAmount,
          additionalDescription: optionalTrim(dto.additionalDescription),
          scope,
          targetBuildingId: targets.targetBuildingId,
          targetUnitId: targets.targetUnitId,
          status: dto.status ?? MaintenanceConfigStatus.ACTIVE,
        },
      });
      await this.audit(
        tx,
        user.id,
        societyId,
        'maintenance_config.create',
        created.id,
      );
      return created;
    });
    return toConfigDto(config);
  }

  async listConfigs(
    user: AuthenticatedUser,
    societyId: string,
  ): Promise<MaintenanceConfigDto[]> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const configs = await this.prisma.maintenanceConfiguration.findMany({
      where: { societyId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return configs.map(toConfigDto);
  }

  async updateConfig(
    user: AuthenticatedUser,
    configId: string,
    dto: UpdateMaintenanceConfigDto,
  ): Promise<MaintenanceConfigDto> {
    const existing = await this.requireConfig(configId);
    await this.authorization.assertCanAdministerSociety(
      user,
      existing.societyId,
    );

    const scope = dto.scope ?? existing.scope;
    const targets = await this.resolveConfigScope(existing.societyId, scope, {
      targetBuildingId:
        dto.targetBuildingId !== undefined
          ? (dto.targetBuildingId ?? undefined)
          : (existing.targetBuildingId ?? undefined),
      targetUnitId:
        dto.targetUnitId !== undefined
          ? (dto.targetUnitId ?? undefined)
          : (existing.targetUnitId ?? undefined),
    });

    const data: Prisma.MaintenanceConfigurationUncheckedUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: optionalTrim(dto.description ?? undefined) }
        : {}),
      ...(dto.monthlyAmount !== undefined
        ? { monthlyAmount: (() => {
            const amount = money(dto.monthlyAmount);
            assertPositive(amount, 'monthlyAmount');
            return amount;
          })() }
        : {}),
      ...(dto.dueDayOfMonth !== undefined
        ? { dueDayOfMonth: dto.dueDayOfMonth }
        : {}),
      ...(dto.additionalAmount !== undefined
        ? { additionalAmount: (() => {
            const amount = money(dto.additionalAmount);
            assertNonNegative(amount, 'additionalAmount');
            return amount;
          })() }
        : {}),
      ...(dto.additionalDescription !== undefined
        ? {
            additionalDescription: optionalTrim(
              dto.additionalDescription ?? undefined,
            ),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      scope,
      targetBuildingId: targets.targetBuildingId,
      targetUnitId: targets.targetUnitId,
    };

    const config = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceConfiguration.update({
        where: { id: configId },
        data,
      });
      await this.audit(
        tx,
        user.id,
        existing.societyId,
        'maintenance_config.update',
        updated.id,
      );
      return updated;
    });
    return toConfigDto(config);
  }

  async previewBills(
    user: AuthenticatedUser,
    societyId: string,
    dto: GenerateBillsDto,
  ): Promise<GenerateBillsResultDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const prepared = await this.prepareGeneration(societyId, dto);
    return toGenerateResult({
      items: prepared.candidates.map((candidate) => candidate.preview),
      alreadyExisting: prepared.alreadyExisting,
      skippedIneligible: prepared.skippedIneligible,
      failed: [],
    });
  }

  async generateBills(
    user: AuthenticatedUser,
    societyId: string,
    dto: GenerateBillsDto,
  ): Promise<GenerateBillsResultDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    /**
     * Concurrency strategy:
     * Use a transaction-scoped PostgreSQL advisory lock keyed by society + billing
     * period so concurrent admin generate calls serialize invoice-number assignment
     * and existing-bill checks. `openPeriodKey` is the hard duplicate guard.
     * Only that unique violation is treated as already-existing.
     */
    const summary = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`billing-generate:${societyId}`}),
          ${(dto.periodYear * 100 + dto.periodMonth) | 0}
        )
      `;

      const prepared = await this.prepareGeneration(societyId, dto, tx);
      const created: BillDto[] = [];
      const failed: GenerateBillsResultDto['failed'] = [];
      let alreadyExisting = prepared.alreadyExisting;

      for (const candidate of prepared.candidates) {
        try {
          const bill = await tx.maintenanceBill.create({
            data: {
              ...candidate.createData,
              lineItems: { create: candidate.lineItems },
            },
            include: billIncludes,
          });
          created.push(toBillDto(bill));
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            isOpenBillConflict(error.meta?.target)
          ) {
            alreadyExisting += 1;
            continue;
          }
          this.logger.error(
            `Failed to create maintenance bill for unit ${candidate.createData.unitId}`,
            error instanceof Error ? error.stack : undefined,
          );
          failed.push({
            unitId: candidate.createData.unitId,
            unitNumber: candidate.preview.unitNumber,
            reason: isInvoiceNumberConflict(error)
              ? 'Could not assign a unique invoice number'
              : 'Failed to create maintenance bill',
          });
        }
      }

      const result = toGenerateResult({
        items: created,
        alreadyExisting,
        skippedIneligible: prepared.skippedIneligible,
        failed,
      });
      await this.audit(tx, user.id, societyId, 'maintenance_bills.generate', societyId, {
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        createdCount: result.createdCount,
        alreadyExisting: result.alreadyExisting,
        skippedIneligible: result.skippedIneligible,
        failedCount: result.failed.length,
      });
      return result;
    });

    return summary;
  }

  async listBills(
    user: AuthenticatedUser,
    societyId: string,
    query: ListBillsQueryDto,
  ): Promise<PaginatedBills> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin = await this.isSocietyAdmin(user, societyId, membership?.role);
    await this.refreshOverdue(societyId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.MaintenanceBillWhereInput = {
      societyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodYear ? { periodYear: query.periodYear } : {}),
      ...(query.periodMonth ? { periodMonth: query.periodMonth } : {}),
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
    };

    if (isAdmin) {
      if (query.unitId) where.unitId = query.unitId;
    } else {
      const unitId = membership?.primaryUnitId;
      if (!unitId) {
        return { items: [], page, limit, total: 0 };
      }
      if (query.unitId && query.unitId !== unitId) {
        throw new ForbiddenException({
          message: 'You can only list bills for your own unit',
          code: 'FORBIDDEN',
        });
      }
      where.unitId = unitId;
      if (
        query.status === MaintenanceBillStatus.DRAFT ||
        query.status === MaintenanceBillStatus.CANCELLED
      ) {
        return { items: [], page, limit, total: 0 };
      }
      where.status = query.status
        ? query.status
        : {
            notIn: [
              MaintenanceBillStatus.DRAFT,
              MaintenanceBillStatus.CANCELLED,
            ],
          };
    }

    const [total, bills] = await this.prisma.$transaction([
      this.prisma.maintenanceBill.count({ where }),
      this.prisma.maintenanceBill.findMany({
        where,
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: billIncludes,
      }),
    ]);

    return { items: bills.map(toBillDto), page, limit, total };
  }

  async getBill(user: AuthenticatedUser, billId: string): Promise<BillDto> {
    const bill = await this.requireBill(billId);
    await this.assertCanViewBill(user, bill);
    if (
      bill.status !== MaintenanceBillStatus.DRAFT &&
      bill.status !== MaintenanceBillStatus.CANCELLED
    ) {
      await this.refreshOverdueForBill(bill);
    }
    const fresh = await this.requireBill(billId);
    return toBillDto(fresh);
  }

  async publishBill(
    user: AuthenticatedUser,
    billId: string,
  ): Promise<BillDto> {
    const bill = await this.requireBill(billId);
    await this.authorization.assertCanAdministerSociety(user, bill.societyId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.maintenanceBill.updateMany({
        where: { id: billId, status: MaintenanceBillStatus.DRAFT },
        data: { status: MaintenanceBillStatus.PUBLISHED },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          message: 'Only draft bills can be published',
          code: 'CONFLICT',
        });
      }
      await this.audit(tx, user.id, bill.societyId, 'maintenance_bill.publish', billId);
      return tx.maintenanceBill.findUniqueOrThrow({
        where: { id: billId },
        include: billIncludes,
      });
    });
    return toBillDto(updated);
  }

  async publishPeriod(
    user: AuthenticatedUser,
    societyId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<{ publishedCount: number }> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceBill.updateMany({
        where: {
          societyId,
          periodYear,
          periodMonth,
          status: MaintenanceBillStatus.DRAFT,
        },
        data: { status: MaintenanceBillStatus.PUBLISHED },
      });
      await this.audit(tx, user.id, societyId, 'maintenance_bills.publish_period', societyId, {
        periodYear,
        periodMonth,
        publishedCount: updated.count,
      });
      return updated;
    });
    return { publishedCount: result.count };
  }

  async cancelBill(
    user: AuthenticatedUser,
    billId: string,
  ): Promise<BillDto> {
    const bill = await this.requireBill(billId);
    await this.authorization.assertCanAdministerSociety(user, bill.societyId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.maintenanceBill.updateMany({
        where: {
          id: billId,
          paidAmount: { lte: 0 },
          status: { not: MaintenanceBillStatus.CANCELLED },
        },
        data: {
          status: MaintenanceBillStatus.CANCELLED,
          openPeriodKey: null,
        },
      });
      if (changed.count !== 1) {
        const current = await tx.maintenanceBill.findUniqueOrThrow({
          where: { id: billId },
          select: { status: true },
        });
        throw new ConflictException({
          message:
            current.status === MaintenanceBillStatus.CANCELLED
              ? 'Bill is already cancelled'
              : 'Bills with recorded payments cannot be cancelled; reverse payments first',
          code: 'CONFLICT',
        });
      }
      await this.audit(tx, user.id, bill.societyId, 'maintenance_bill.cancel', billId);
      return tx.maintenanceBill.findUniqueOrThrow({
        where: { id: billId },
        include: billIncludes,
      });
    });
    return toBillDto(updated);
  }

  async recordPayment(
    user: AuthenticatedUser,
    billId: string,
    dto: RecordPaymentDto,
  ): Promise<{ payment: PaymentDto; bill: BillDto }> {
    const bill = await this.requireBill(billId);
    await this.authorization.assertCanAdministerSociety(user, bill.societyId);

    const idempotencyKey = dto.idempotencyKey.trim();
    if (idempotencyKey.length < 8) {
      throw new BadRequestException({
        message: 'idempotencyKey must be at least 8 characters',
        code: 'BAD_REQUEST',
      });
    }

    if (
      bill.status === MaintenanceBillStatus.DRAFT ||
      bill.status === MaintenanceBillStatus.CANCELLED ||
      bill.status === MaintenanceBillStatus.PAID
    ) {
      throw new ConflictException({
        message: 'Payments cannot be recorded against this bill status',
        code: 'CONFLICT',
      });
    }

    const amount = money(dto.amount);
    assertPositive(amount, 'amount');
    if (amount.greaterThan(bill.outstandingAmount as Money)) {
      throw new BadRequestException({
        message:
          'Payment exceeds outstanding amount (overpayment is not supported)',
        code: 'BAD_REQUEST',
      });
    }

    const paidAt = parseExplicitInstant(dto.paidAt, 'paidAt');

    const referenceNumber = optionalTrim(dto.referenceNumber);
    const notes = optionalTrim(dto.notes);
    const requestHash = paymentRequestHash({
      billId,
      amount: moneyString(amount),
      method: dto.method,
      paidAt: paidAt.toISOString(),
      referenceNumber,
      notes,
    });

    const existing = await this.prisma.maintenancePayment.findUnique({
      where: {
        societyId_recordedByUserId_idempotencyKey: {
          societyId: bill.societyId,
          recordedByUserId: user.id,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      return this.resolveIdempotentPayment(existing, requestHash, billId);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            status: MaintenanceBillStatus;
            paid_amount: Prisma.Decimal;
            outstanding_amount: Prisma.Decimal;
            total_amount: Prisma.Decimal;
            due_date: Date;
          }>
        >`
          SELECT id, status, paid_amount, outstanding_amount, total_amount, due_date
          FROM maintenance_bills
          WHERE id = ${billId}::uuid
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          throw new NotFoundException({
            message: 'Bill not found',
            code: 'NOT_FOUND',
          });
        }
        if (
          current.status === MaintenanceBillStatus.DRAFT ||
          current.status === MaintenanceBillStatus.CANCELLED ||
          current.status === MaintenanceBillStatus.PAID
        ) {
          throw new ConflictException({
            message: 'Payments cannot be recorded against this bill status',
            code: 'CONFLICT',
          });
        }

        const outstanding = money(String(current.outstanding_amount));
        if (amount.greaterThan(outstanding)) {
          throw new BadRequestException({
            message:
              'Payment exceeds outstanding amount (overpayment is not supported)',
            code: 'BAD_REQUEST',
          });
        }

        const payment = await tx.maintenancePayment.create({
          data: {
            societyId: bill.societyId,
            billId: bill.id,
            amount,
            method: dto.method,
            paidAt,
            referenceNumber,
            notes,
            status: PaymentRecordStatus.RECORDED,
            idempotencyKey,
            requestHash,
            recordedByUserId: user.id,
          },
        });

        const paidAmount = money(String(current.paid_amount))
          .plus(amount)
          .toDecimalPlaces(2);
        const outstandingAmount = money(String(current.total_amount))
          .minus(paidAmount)
          .toDecimalPlaces(2);
        const status = deriveBillStatus(
          current.status,
          paidAmount,
          outstandingAmount,
          current.due_date,
        );

        const updatedBill = await tx.maintenanceBill.update({
          where: { id: bill.id },
          data: { paidAmount, outstandingAmount, status },
          include: billIncludes,
        });

        await this.audit(
          tx,
          user.id,
          bill.societyId,
          'maintenance_payment.record',
          payment.id,
          {
            billId,
            amount: moneyString(amount),
            idempotencyKey,
          },
        );

        return { payment, bill: updatedBill };
      });

      return {
        payment: toPaymentDto(result.payment),
        bill: toBillDto(result.bill),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.maintenancePayment.findUnique({
          where: {
            societyId_recordedByUserId_idempotencyKey: {
              societyId: bill.societyId,
              recordedByUserId: user.id,
              idempotencyKey,
            },
          },
        });
        if (raced) {
          return this.resolveIdempotentPayment(raced, requestHash, billId);
        }
      }
      throw error;
    }
  }

  async reversePayment(
    user: AuthenticatedUser,
    paymentId: string,
    dto: ReversePaymentDto,
  ): Promise<{ payment: PaymentDto; bill: BillDto }> {
    const payment = await this.prisma.maintenancePayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException({
        message: 'Payment not found',
        code: 'NOT_FOUND',
      });
    }
    await this.authorization.assertCanAdministerSociety(user, payment.societyId);
    if (payment.status === PaymentRecordStatus.REVERSED) {
      throw new ConflictException({
        message: 'Payment is already reversed',
        code: 'CONFLICT',
      });
    }

    const bill = await this.requireBill(payment.billId);
    const amount = payment.amount as Money;

    const result = await this.prisma.$transaction(async (tx) => {
      const reversedCount = await tx.maintenancePayment.updateMany({
        where: {
          id: paymentId,
          status: PaymentRecordStatus.RECORDED,
        },
        data: {
          status: PaymentRecordStatus.REVERSED,
          reversedAt: new Date(),
          reversedByUserId: user.id,
          reversalReason: dto.reason.trim(),
        },
      });
      if (reversedCount.count !== 1) {
        throw new ConflictException({
          message: 'Payment is already reversed',
          code: 'CONFLICT',
        });
      }

      const reversed = await tx.maintenancePayment.findUniqueOrThrow({
        where: { id: paymentId },
      });

      await tx.$queryRaw`
        SELECT id FROM maintenance_bills WHERE id = ${bill.id}::uuid FOR UPDATE
      `;
      const lockedBill = await tx.maintenanceBill.findUniqueOrThrow({
        where: { id: bill.id },
      });

      const paidAmount = MoneyMaxZero(
        (lockedBill.paidAmount as Money).minus(amount).toDecimalPlaces(2),
      );
      const outstandingAmount = (lockedBill.totalAmount as Money)
        .minus(paidAmount)
        .toDecimalPlaces(2);
      const status = deriveBillStatus(
        lockedBill.status,
        paidAmount,
        outstandingAmount,
        lockedBill.dueDate,
      );

      const updatedBill = await tx.maintenanceBill.update({
        where: { id: bill.id },
        data: { paidAmount, outstandingAmount, status },
        include: billIncludes,
      });

      await this.audit(
        tx,
        user.id,
        payment.societyId,
        'maintenance_payment.reverse',
        paymentId,
        { reason: dto.reason.trim() },
      );

      return { payment: reversed, bill: updatedBill };
    });

    return {
      payment: toPaymentDto(result.payment),
      bill: toBillDto(result.bill),
    };
  }

  async getInvoicePdf(
    user: AuthenticatedUser,
    billId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const bill = await this.requireBill(billId);
    await this.assertCanViewBill(user, bill);
    const society = await this.prisma.society.findUniqueOrThrow({
      where: { id: bill.societyId },
      select: {
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
      },
    });
    const payments = await this.prisma.maintenancePayment.findMany({
      where: { billId },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    });
    const buffer = await buildInvoicePdf({
      society,
      bill: toBillDto(bill),
      payments: payments.map(toPaymentDto),
    });
    return {
      buffer,
      filename: `${bill.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`,
    };
  }

  async listPaymentsForBill(
    user: AuthenticatedUser,
    billId: string,
  ): Promise<PaymentDto[]> {
    const bill = await this.requireBill(billId);
    await this.assertCanViewBill(user, bill);
    const payments = await this.prisma.maintenancePayment.findMany({
      where: { billId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
    return payments.map(toPaymentDto);
  }

  async getDashboard(
    user: AuthenticatedUser,
    societyId: string,
    filters?: {
      periodYear?: number;
      periodMonth?: number;
      buildingId?: string;
    },
  ): Promise<BillingDashboardDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    await this.refreshOverdue(societyId);

    const where: Prisma.MaintenanceBillWhereInput = {
      societyId,
      status: { not: MaintenanceBillStatus.CANCELLED },
      ...(filters?.periodYear ? { periodYear: filters.periodYear } : {}),
      ...(filters?.periodMonth ? { periodMonth: filters.periodMonth } : {}),
      ...(filters?.buildingId ? { buildingId: filters.buildingId } : {}),
    };

    const groups = await this.prisma.maintenanceBill.groupBy({
      by: ['status'],
      where: {
        ...where,
        status: {
          notIn: [
            MaintenanceBillStatus.CANCELLED,
            MaintenanceBillStatus.DRAFT,
          ],
        },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
        outstandingAmount: true,
      },
      _count: { _all: true },
    });

    let totalBilled = money('0');
    let totalCollected = money('0');
    let totalOutstanding = money('0');
    let overdueAmount = money('0');
    let paidInvoiceCount = 0;
    let partiallyPaidInvoiceCount = 0;
    let unpaidInvoiceCount = 0;

    for (const group of groups) {
      const count = group._count._all;
      totalBilled = totalBilled.plus(money(group._sum.totalAmount ?? 0));
      totalCollected = totalCollected.plus(money(group._sum.paidAmount ?? 0));
      totalOutstanding = totalOutstanding.plus(
        money(group._sum.outstandingAmount ?? 0),
      );
      if (group.status === MaintenanceBillStatus.OVERDUE) {
        overdueAmount = overdueAmount.plus(
          money(group._sum.outstandingAmount ?? 0),
        );
      }
      if (group.status === MaintenanceBillStatus.PAID) paidInvoiceCount += count;
      if (group.status === MaintenanceBillStatus.PARTIALLY_PAID) {
        partiallyPaidInvoiceCount += count;
      }
      if (
        group.status === MaintenanceBillStatus.PUBLISHED ||
        group.status === MaintenanceBillStatus.OVERDUE
      ) {
        unpaidInvoiceCount += count;
      }
    }

    return {
      totalBilled: moneyString(totalBilled.toDecimalPlaces(2)),
      totalCollected: moneyString(totalCollected.toDecimalPlaces(2)),
      totalOutstanding: moneyString(totalOutstanding.toDecimalPlaces(2)),
      overdueAmount: moneyString(overdueAmount.toDecimalPlaces(2)),
      paidInvoiceCount,
      partiallyPaidInvoiceCount,
      unpaidInvoiceCount,
    };
  }

  async sumOutstandingForUnit(
    societyId: string,
    unitId: string,
  ): Promise<string> {
    const sum = await this.prisma.maintenanceBill.aggregate({
      where: {
        societyId,
        unitId,
        status: {
          in: [
            MaintenanceBillStatus.PUBLISHED,
            MaintenanceBillStatus.PARTIALLY_PAID,
            MaintenanceBillStatus.OVERDUE,
          ],
        },
      },
      _sum: { outstandingAmount: true },
    });
    return moneyString(money(sum._sum.outstandingAmount ?? 0));
  }

  private async resolveIdempotentPayment(
    existing: {
      id: string;
      billId: string;
      requestHash: string;
    },
    requestHash: string,
    billId: string,
  ): Promise<{ payment: PaymentDto; bill: BillDto }> {
    if (existing.billId !== billId || existing.requestHash !== requestHash) {
      throw new ConflictException({
        message:
          'Idempotency key was already used with a different payment payload',
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    const [payment, bill] = await Promise.all([
      this.prisma.maintenancePayment.findUniqueOrThrow({
        where: { id: existing.id },
      }),
      this.requireBill(existing.billId),
    ]);
    return {
      payment: toPaymentDto(payment),
      bill: toBillDto(bill),
    };
  }

  private async prepareGeneration(
    societyId: string,
    dto: GenerateBillsDto,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const config = await db.maintenanceConfiguration.findUnique({
      where: { id: dto.configId },
    });
    if (!config) {
      throw new NotFoundException({
        message: 'Maintenance configuration not found',
        code: 'NOT_FOUND',
      });
    }
    if (config.societyId !== societyId) {
      throw new BadRequestException({
        message: 'Configuration does not belong to this society',
        code: 'BAD_REQUEST',
      });
    }
    if (config.status !== MaintenanceConfigStatus.ACTIVE) {
      throw new BadRequestException({
        message: 'Configuration is inactive',
        code: 'BAD_REQUEST',
      });
    }

    const discountAmount = money(dto.discountAmount ?? '0');
    assertNonNegative(discountAmount, 'discountAmount');

    const scopedUnits = await this.findScopedUnits(config, db);
    const eligibleUnits = scopedUnits.filter(
      (unit) => unit.status === UnitStatus.ACTIVE,
    );
    const skippedIneligible = scopedUnits.length - eligibleUnits.length;

    const existing = await db.maintenanceBill.findMany({
      where: {
        societyId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        unitId: { in: eligibleUnits.map((unit) => unit.id) },
        status: { in: OPEN_BILL_STATUSES },
      },
      select: { unitId: true },
    });
    const existingUnitIds = new Set(existing.map((row) => row.unitId));

    const period = periodBounds(dto.periodYear, dto.periodMonth);
    const dueDate = dueDateFor(dto.periodYear, dto.periodMonth, config.dueDayOfMonth);
    const invoiceDate = new Date();
    invoiceDate.setUTCHours(0, 0, 0, 0);

    const residents = await db.societyMembership.findMany({
      where: {
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.RESIDENT_USER,
        primaryUnitId: { in: eligibleUnits.map((unit) => unit.id) },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, primaryUnitId: true },
    });
    const residentByUnit = new Map<string, string>();
    for (const membership of residents) {
      if (
        membership.primaryUnitId &&
        !residentByUnit.has(membership.primaryUnitId)
      ) {
        residentByUnit.set(membership.primaryUnitId, membership.userId);
      }
    }

    const candidates = [];
    let alreadyExisting = 0;
    let seq = 1;

    for (const unit of eligibleUnits) {
      if (existingUnitIds.has(unit.id)) {
        alreadyExisting += 1;
        continue;
      }

      const baseAmount = config.monthlyAmount as Money;
      const additionalAmount = config.additionalAmount as Money;
      const totalAmount = computeTotal(baseAmount, additionalAmount, discountAmount);
      const invoiceNumber = buildInvoiceNumber(
        dto.periodYear,
        dto.periodMonth,
        unit.unitNumber,
        unit.id,
        seq,
      );
      seq += 1;

      const lineItems: Array<{
        description: string;
        amount: Money;
        lineType: InvoiceLineType;
      }> = [
        {
          description: config.name,
          amount: baseAmount,
          lineType: InvoiceLineType.BASE,
        },
      ];
      if (additionalAmount.greaterThan(0)) {
        lineItems.push({
          description:
            config.additionalDescription?.trim() || 'Additional charges',
          amount: additionalAmount,
          lineType: InvoiceLineType.ADDITIONAL,
        });
      }
      if (discountAmount.greaterThan(0)) {
        lineItems.push({
          description: 'Discount',
          amount: discountAmount,
          lineType: InvoiceLineType.DISCOUNT,
        });
      }

      const createData = {
        societyId,
        buildingId: unit.buildingId,
        unitId: unit.id,
        configId: config.id,
        billedUserId: residentByUnit.get(unit.id) ?? null,
        invoiceNumber,
        openPeriodKey: openBillKey(unit.id, dto.periodYear, dto.periodMonth),
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        periodStart: period.start,
        periodEnd: period.end,
        invoiceDate,
        dueDate,
        baseAmount,
        additionalAmount,
        discountAmount,
        totalAmount,
        paidAmount: money('0'),
        outstandingAmount: totalAmount,
        status: MaintenanceBillStatus.DRAFT,
      };

      candidates.push({
        createData,
        lineItems,
        preview: toBillDto({
          id: randomUUID(),
          ...createData,
          createdAt: new Date(),
          updatedAt: new Date(),
          unit: { unitNumber: unit.unitNumber },
          building: { code: unit.building.code },
          lineItems: lineItems.map((item, index) => ({
            id: `preview-${index}`,
            billId: 'preview',
            description: item.description,
            amount: item.amount,
            lineType: item.lineType,
            createdAt: new Date(),
          })),
        }),
      });
    }

    return { candidates, alreadyExisting, skippedIneligible };
  }

  private async findScopedUnits(
    config: {
      societyId: string;
      scope: MaintenanceConfigScope;
      targetBuildingId: string | null;
      targetUnitId: string | null;
    },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const where: Prisma.UnitWhereInput = {
      societyId: config.societyId,
    };
    if (config.scope === MaintenanceConfigScope.BUILDING) {
      where.buildingId = config.targetBuildingId ?? undefined;
    }
    if (config.scope === MaintenanceConfigScope.UNIT) {
      where.id = config.targetUnitId ?? undefined;
    }
    return db.unit.findMany({
      where,
      select: {
        id: true,
        buildingId: true,
        unitNumber: true,
        status: true,
        building: { select: { code: true } },
      },
      orderBy: [{ buildingId: 'asc' }, { unitNumber: 'asc' }],
    });
  }

  private async resolveConfigScope(
    societyId: string,
    scope: MaintenanceConfigScope,
    input: { targetBuildingId?: string | null; targetUnitId?: string | null },
  ) {
    if (scope === MaintenanceConfigScope.SOCIETY) {
      if (input.targetBuildingId || input.targetUnitId) {
        throw new BadRequestException({
          message: 'Society-scoped configs must not target building/unit',
          code: 'BAD_REQUEST',
        });
      }
      return { targetBuildingId: null, targetUnitId: null };
    }
    if (scope === MaintenanceConfigScope.BUILDING) {
      if (!input.targetBuildingId) {
        throw new BadRequestException({
          message: 'Building scope requires targetBuildingId',
          code: 'BAD_REQUEST',
        });
      }
      const building = await this.prisma.building.findFirst({
        where: { id: input.targetBuildingId, societyId },
        select: { id: true },
      });
      if (!building) {
        throw new BadRequestException({
          message: 'Target building was not found in this society',
          code: 'BAD_REQUEST',
        });
      }
      return { targetBuildingId: building.id, targetUnitId: null };
    }
    if (!input.targetUnitId) {
      throw new BadRequestException({
        message: 'Unit scope requires targetUnitId',
        code: 'BAD_REQUEST',
      });
    }
    const unit = await this.prisma.unit.findFirst({
      where: { id: input.targetUnitId, societyId },
      select: { id: true, buildingId: true },
    });
    if (!unit) {
      throw new BadRequestException({
        message: 'Target unit was not found in this society',
        code: 'BAD_REQUEST',
      });
    }
    return { targetBuildingId: unit.buildingId, targetUnitId: unit.id };
  }

  private async requireConfig(configId: string) {
    const config = await this.prisma.maintenanceConfiguration.findUnique({
      where: { id: configId },
    });
    if (!config) {
      throw new NotFoundException({
        message: 'Maintenance configuration not found',
        code: 'NOT_FOUND',
      });
    }
    return config;
  }

  private async requireBill(billId: string) {
    const bill = await this.prisma.maintenanceBill.findUnique({
      where: { id: billId },
      include: billIncludes,
    });
    if (!bill) {
      throw new NotFoundException({
        message: 'Bill not found',
        code: 'NOT_FOUND',
      });
    }
    return bill;
  }

  private async isSocietyAdmin(
    user: AuthenticatedUser,
    societyId: string,
    membershipRole?: MembershipRole,
  ): Promise<boolean> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) return true;
    if (membershipRole === MembershipRole.SOCIETY_ADMIN) return true;
    const admin = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.SOCIETY_ADMIN,
      },
      select: { id: true },
    });
    return Boolean(admin);
  }

  private async assertCanViewBill(
    user: AuthenticatedUser,
    bill: {
      societyId: string;
      unitId: string;
      status: MaintenanceBillStatus;
    },
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.authorization.ensureSocietyExists(bill.societyId);
      return;
    }
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: bill.societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: { role: true, primaryUnitId: true },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Bill not found',
        code: 'NOT_FOUND',
      });
    }
    if (membership.role === MembershipRole.SOCIETY_ADMIN) return;
    if (
      membership.primaryUnitId !== bill.unitId ||
      bill.status === MaintenanceBillStatus.DRAFT ||
      bill.status === MaintenanceBillStatus.CANCELLED
    ) {
      throw new NotFoundException({
        message: 'Bill not found',
        code: 'NOT_FOUND',
      });
    }
  }

  private async refreshOverdue(societyId: string): Promise<void> {
    const today = startOfUtcDay(new Date());
    await this.prisma.maintenanceBill.updateMany({
      where: {
        societyId,
        status: {
          in: [
            MaintenanceBillStatus.PUBLISHED,
            MaintenanceBillStatus.PARTIALLY_PAID,
          ],
        },
        dueDate: { lt: today },
        outstandingAmount: { gt: 0 },
      },
      data: { status: MaintenanceBillStatus.OVERDUE },
    });
  }

  private async refreshOverdueForBill(bill: {
    id: string;
    status: MaintenanceBillStatus;
    dueDate: Date;
    outstandingAmount: unknown;
  }): Promise<void> {
    const today = startOfUtcDay(new Date());
    if (
      (bill.status === MaintenanceBillStatus.PUBLISHED ||
        bill.status === MaintenanceBillStatus.PARTIALLY_PAID) &&
      bill.dueDate < today &&
      (bill.outstandingAmount as Money).greaterThan(0)
    ) {
      await this.prisma.maintenanceBill.updateMany({
        where: {
          id: bill.id,
          status: bill.status,
          dueDate: { lt: today },
          outstandingAmount: { gt: 0 },
        },
        data: { status: MaintenanceBillStatus.OVERDUE },
      });
    }
  }

  private async audit(
    db: Prisma.TransactionClient,
    actorUserId: string,
    societyId: string,
    action: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        societyId,
        actorUserId,
        action,
        entityType: 'maintenance_billing',
        entityId,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }
}

function optionalTrim(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function paymentRequestHash(input: {
  billId: string;
  amount: string;
  method: string;
  paidAt: string;
  referenceNumber: string | null;
  notes: string | null;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        billId: input.billId,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
      }),
    )
    .digest('hex');
}

function toGenerateResult(input: {
  items: BillDto[];
  alreadyExisting: number;
  skippedIneligible: number;
  failed: GenerateBillsResultDto['failed'];
}): GenerateBillsResultDto {
  return {
    items: input.items,
    createdCount: input.items.length,
    alreadyExisting: input.alreadyExisting,
    skippedIneligible: input.skippedIneligible,
    failed: input.failed,
    skippedExisting: input.alreadyExisting,
  };
}

function periodBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

function dueDateFor(year: number, month: number, dueDay: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function buildInvoiceNumber(
  year: number,
  month: number,
  unitNumber: string,
  unitId: string,
  seq: number,
): string {
  const safeUnit = unitNumber.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'UNIT';
  const unitToken = unitId.replace(/-/g, '').slice(0, 8);
  return `INV-${year}${String(month).padStart(2, '0')}-${safeUnit}-${unitToken}-${String(seq).padStart(4, '0')}`;
}

function openBillKey(unitId: string, year: number, month: number): string {
  return `${unitId}:${year}:${month}`;
}

function uniqueTargetText(target: unknown): string {
  if (Array.isArray(target)) {
    return target.filter((part) => typeof part === 'string').join(',');
  }
  return typeof target === 'string' ? target : '';
}

export function isOpenBillConflict(target: unknown): boolean {
  const text = uniqueTargetText(target).toLowerCase();
  return (
    text.includes('open_period') ||
    text.includes('openperiodkey') ||
    text.includes('unit_period_open')
  );
}

function isInvoiceNumberConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  return uniqueTargetText(error.meta?.target).toLowerCase().includes('invoice');
}

function deriveBillStatus(
  current: MaintenanceBillStatus,
  paidAmount: Money,
  outstandingAmount: Money,
  dueDate: Date,
): MaintenanceBillStatus {
  if (current === MaintenanceBillStatus.CANCELLED) {
    return MaintenanceBillStatus.CANCELLED;
  }
  if (outstandingAmount.lessThanOrEqualTo(0)) {
    return MaintenanceBillStatus.PAID;
  }
  if (paidAmount.greaterThan(0)) {
    const today = startOfUtcDay(new Date());
    if (dueDate < today) return MaintenanceBillStatus.OVERDUE;
    return MaintenanceBillStatus.PARTIALLY_PAID;
  }
  const today = startOfUtcDay(new Date());
  if (dueDate < today) return MaintenanceBillStatus.OVERDUE;
  return MaintenanceBillStatus.PUBLISHED;
}

function MoneyMaxZero(value: Money): Money {
  return value.lessThan(0) ? money('0') : value;
}
