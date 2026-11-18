import { describe, expect, it } from 'vitest';
import { ComplaintStatus } from '../generated/prisma/client.js';
import { canTransition } from './complaint-transitions.js';

describe('complaint transitions', () => {
  it('allows valid admin and reopen paths', () => {
    expect(canTransition(ComplaintStatus.OPEN, ComplaintStatus.ACKNOWLEDGED)).toBe(
      true,
    );
    expect(canTransition(ComplaintStatus.ACKNOWLEDGED, ComplaintStatus.IN_PROGRESS)).toBe(
      true,
    );
    expect(canTransition(ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED)).toBe(
      true,
    );
    expect(canTransition(ComplaintStatus.RESOLVED, ComplaintStatus.REOPENED)).toBe(
      true,
    );
    expect(canTransition(ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED)).toBe(
      true,
    );
  });

  it('rejects invalid transitions including from CLOSED', () => {
    expect(canTransition(ComplaintStatus.OPEN, ComplaintStatus.RESOLVED)).toBe(
      false,
    );
    expect(canTransition(ComplaintStatus.CLOSED, ComplaintStatus.REOPENED)).toBe(
      false,
    );
    expect(canTransition(ComplaintStatus.RESOLVED, ComplaintStatus.IN_PROGRESS)).toBe(
      false,
    );
  });
});
