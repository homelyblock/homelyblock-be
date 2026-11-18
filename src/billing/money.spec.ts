import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { computeTotal, money, moneyString } from './money.js';

describe('money helpers', () => {
  it('rounds to two decimal places without floating error', () => {
    expect(moneyString(money('10.005'))).toBe('10.01');
    expect(moneyString(money('0.1').plus(money('0.2')))).toBe('0.30');
  });

  it('computes totals with discounts', () => {
    const total = computeTotal(money('1500'), money('100'), money('50'));
    expect(moneyString(total)).toBe('1550.00');
  });

  it('rejects negative totals', () => {
    expect(() => computeTotal(money('10'), money('0'), money('20'))).toThrow(
      BadRequestException,
    );
  });
});
