import { ComplaintStatus } from '../generated/prisma/client.js';

const ALLOWED: Record<ComplaintStatus, ComplaintStatus[]> = {
  [ComplaintStatus.OPEN]: [
    ComplaintStatus.ACKNOWLEDGED,
    ComplaintStatus.IN_PROGRESS,
    ComplaintStatus.CLOSED,
  ],
  [ComplaintStatus.ACKNOWLEDGED]: [
    ComplaintStatus.IN_PROGRESS,
    ComplaintStatus.RESOLVED,
    ComplaintStatus.CLOSED,
  ],
  [ComplaintStatus.IN_PROGRESS]: [
    ComplaintStatus.ACKNOWLEDGED,
    ComplaintStatus.RESOLVED,
    ComplaintStatus.CLOSED,
  ],
  [ComplaintStatus.RESOLVED]: [
    ComplaintStatus.CLOSED,
    ComplaintStatus.REOPENED,
  ],
  [ComplaintStatus.REOPENED]: [
    ComplaintStatus.ACKNOWLEDGED,
    ComplaintStatus.IN_PROGRESS,
    ComplaintStatus.RESOLVED,
    ComplaintStatus.CLOSED,
  ],
  [ComplaintStatus.CLOSED]: [],
};

export function canTransition(
  from: ComplaintStatus,
  to: ComplaintStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: ComplaintStatus): ComplaintStatus[] {
  return [...(ALLOWED[from] ?? [])];
}
