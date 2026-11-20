/**
 * Society invitations stay open for 14 days.
 *
 * That covers a resident who registers after the administrator sends the
 * invitation, including a weekend and a short delay, without leaving unused
 * invitations active indefinitely. Override with INVITATION_TTL_DAYS (1–90).
 * The legacy backfill in migration 20261120103000 uses this same 14-day default
 * measured from the original created_at.
 */
export const DEFAULT_INVITATION_TTL_DAYS = 14;
const MIN_INVITATION_TTL_DAYS = 1;
const MAX_INVITATION_TTL_DAYS = 90;

export type InvitationState =
  | 'PENDING'
  | 'EXPIRED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REMOVED';

export function invitationTtlDays(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_INVITATION_TTL_DAYS;
  }
  if (typeof raw !== 'string') {
    throw new Error('INVITATION_TTL_DAYS must be a whole number of days');
  }
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error('INVITATION_TTL_DAYS must be a whole number of days');
  }
  const days = Number(value);
  if (days < MIN_INVITATION_TTL_DAYS || days > MAX_INVITATION_TTL_DAYS) {
    throw new Error(
      `INVITATION_TTL_DAYS must be between ${MIN_INVITATION_TTL_DAYS} and ${MAX_INVITATION_TTL_DAYS}`,
    );
  }
  return days;
}

export function invitationTtlMs(days = invitationTtlDays(process.env.INVITATION_TTL_DAYS)): number {
  return days * 24 * 60 * 60 * 1000;
}

export function invitationExpiry(from: Date, ttlMs: number): Date {
  return new Date(from.getTime() + ttlMs);
}

export function isInvitationExpired(
  membership: {
    status: string;
    invitationExpiresAt: Date | null;
  },
  now = new Date(),
): boolean {
  if (membership.status !== 'INVITED') return false;
  if (!membership.invitationExpiresAt) return true;
  return membership.invitationExpiresAt.getTime() <= now.getTime();
}

export function invitationState(membership: {
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  invitationExpiresAt: Date | null;
}, now = new Date()): InvitationState {
  if (membership.status === 'INVITED') {
    return isInvitationExpired(membership, now) ? 'EXPIRED' : 'PENDING';
  }
  if (membership.status === 'ACTIVE') return 'ACTIVE';
  if (membership.status === 'SUSPENDED') return 'SUSPENDED';
  return 'REMOVED';
}
