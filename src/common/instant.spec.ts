import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { formatIndiaDateTime, parseExplicitInstant } from './instant.js';

describe('parseExplicitInstant', () => {
  it('stores an India offset and a Zulu instant as the same moment', () => {
    const fromIndia = parseExplicitInstant(
      '2026-01-16T00:00:00+05:30',
      'paidAt',
    );
    const fromZulu = parseExplicitInstant(
      '2026-01-15T18:30:00.000Z',
      'paidAt',
    );
    expect(fromIndia.toISOString()).toBe('2026-01-15T18:30:00.000Z');
    expect(fromZulu.toISOString()).toBe(fromIndia.toISOString());
    expect(formatIndiaDateTime(fromIndia.toISOString())).toBe(
      '16 Jan 2026, 12:00 am',
    );
  });

  it('keeps the fixed India offset in summer and winter', () => {
    expect(
      parseExplicitInstant('2026-06-15T00:00:00+05:30', 'expectedAt').toISOString(),
    ).toBe('2026-06-14T18:30:00.000Z');
    expect(
      parseExplicitInstant('2026-01-16T00:00:00+05:30', 'expectedAt').toISOString(),
    ).toBe('2026-01-15T18:30:00.000Z');
  });

  it('rejects a timestamp with no offset and an impossible date', () => {
    expect(() =>
      parseExplicitInstant('2026-01-16T00:00:00', 'paidAt'),
    ).toThrow(BadRequestException);
    expect(() =>
      parseExplicitInstant('2026-02-31T00:00:00+05:30', 'paidAt'),
    ).toThrow(BadRequestException);
  });
});
