import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVITATION_TTL_DAYS,
  invitationExpiry,
  invitationState,
  invitationTtlDays,
  isInvitationExpired,
} from './invitation-policy.js';

describe('invitation policy', () => {
  it('uses a 14 day default and rejects values outside 1–90', () => {
    expect(invitationTtlDays(undefined)).toBe(DEFAULT_INVITATION_TTL_DAYS);
    expect(invitationTtlDays('30')).toBe(30);
    expect(() => invitationTtlDays('0')).toThrow(/INVITATION_TTL_DAYS/);
    expect(() => invitationTtlDays('91')).toThrow(/INVITATION_TTL_DAYS/);
    expect(() => invitationTtlDays('soon')).toThrow(/INVITATION_TTL_DAYS/);
  });

  it('treats a missing or past deadline as expired only while invited', () => {
    const past = new Date('2020-01-01T00:00:00.000Z');
    expect(
      isInvitationExpired({ status: 'INVITED', invitationExpiresAt: past }),
    ).toBe(true);
    expect(
      isInvitationExpired({ status: 'INVITED', invitationExpiresAt: null }),
    ).toBe(true);
    expect(
      isInvitationExpired({ status: 'ACTIVE', invitationExpiresAt: past }),
    ).toBe(false);
    const start = new Date('2026-01-01T00:00:00.000Z');
    expect(invitationExpiry(start, 14 * 24 * 60 * 60 * 1000).toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
    expect(
      invitationState({
        status: 'INVITED',
        invitationExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
    ).toBe('PENDING');
  });
});