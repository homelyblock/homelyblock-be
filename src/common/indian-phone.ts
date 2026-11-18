import { BadRequestException } from '@nestjs/common';

/**
 * Indian mobile or landline: optional +91 or trunk 0, then 10 digits.
 * Spaces and hyphens are allowed between digits.
 */
export const INDIAN_PHONE_PATTERN =
  /^(?:\+91[\s-]?|91[\s-]?|0)?[1-9](?:[\s-]?[0-9]){9}$/;

export const INDIAN_PHONE_MESSAGE =
  'Enter an Indian phone number, such as +91 98765 43210';

/** Store one canonical form so tel and WhatsApp links stay consistent. */
export function normalizeIndianPhone(value: string): string {
  const compact = value.trim().replace(/[\s-]/g, '');
  let digits = compact.startsWith('+') ? compact.slice(1) : compact;
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (!/^[1-9][0-9]{9}$/.test(digits)) {
    throw new BadRequestException({
      message: INDIAN_PHONE_MESSAGE,
      code: 'BAD_REQUEST',
    });
  }
  return `+91${digits}`;
}
