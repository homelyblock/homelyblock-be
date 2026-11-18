import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

export type Money = Prisma.Decimal;

export function money(value: string | number | Prisma.Decimal): Money {
  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite() || decimal.isNaN()) {
      throw new Error('invalid');
    }
    return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  } catch {
    throw new BadRequestException({
      message: 'Invalid monetary amount',
      code: 'BAD_REQUEST',
    });
  }
}

export function moneyString(value: Money): string {
  return value.toFixed(2);
}

export function assertNonNegative(amount: Money, label: string): void {
  if (amount.lessThan(0)) {
    throw new BadRequestException({
      message: `${label} must be greater than or equal to 0`,
      code: 'BAD_REQUEST',
    });
  }
}

export function assertPositive(amount: Money, label: string): void {
  if (amount.lessThanOrEqualTo(0)) {
    throw new BadRequestException({
      message: `${label} must be greater than 0`,
      code: 'BAD_REQUEST',
    });
  }
}

export function computeTotal(
  base: Money,
  additional: Money,
  discount: Money,
): Money {
  assertNonNegative(base, 'baseAmount');
  assertNonNegative(additional, 'additionalAmount');
  assertNonNegative(discount, 'discountAmount');
  const total = base.plus(additional).minus(discount).toDecimalPlaces(2);
  if (total.lessThan(0)) {
    throw new BadRequestException({
      message: 'Total amount cannot be negative',
      code: 'BAD_REQUEST',
    });
  }
  return total;
}
