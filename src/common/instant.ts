import { BadRequestException } from '@nestjs/common';

/** ISO-8601 instant with Z or a numeric offset. A bare local time is rejected. */
const EXPLICIT_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;

function offsetMinutes(offset: string): number {
  if (offset.toUpperCase() === 'Z') return 0;
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(':').map(Number);
  return sign * ((hours ?? 0) * 60 + (minutes ?? 0));
}

/**
 * Parse a timestamp that already names its offset.
 * India has used a fixed +05:30 offset, with no daylight-saving shift.
 * The returned Date is the UTC instant Prisma stores in timestamptz.
 * This does not rewrite rows that are already stored.
 */
export function parseExplicitInstant(value: string, field: string): Date {
  const trimmed = value.trim();
  const match = EXPLICIT_INSTANT.exec(trimmed);
  const date = match ? new Date(trimmed) : null;
  if (!match || !date || Number.isNaN(date.getTime())) {
    throw new BadRequestException({
      message: `${field} must be an ISO-8601 timestamp with a timezone offset, such as 2026-01-16T00:00:00+05:30`,
      code: 'BAD_REQUEST',
    });
  }
  const shifted = new Date(
    date.getTime() + offsetMinutes(match[7] ?? 'Z') * 60_000,
  );
  const sameCalendar =
    shifted.getUTCFullYear() === Number(match[1]) &&
    shifted.getUTCMonth() + 1 === Number(match[2]) &&
    shifted.getUTCDate() === Number(match[3]) &&
    shifted.getUTCHours() === Number(match[4]) &&
    shifted.getUTCMinutes() === Number(match[5]);
  if (!sameCalendar) {
    throw new BadRequestException({
      message: `${field} must be a valid ISO timestamp`,
      code: 'BAD_REQUEST',
    });
  }
  return date;
}

export function formatIndiaDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
