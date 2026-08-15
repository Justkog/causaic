import { describe, expect, it } from 'vitest';

import { approvalDurationForLease } from './execution-host.js';

describe('approvalDurationForLease', () => {
  it('keeps approvals inside a five-minute desktop lease', () => {
    expect(approvalDurationForLease(300_000)).toBe(270_000);
  });

  it('caps approvals for longer leases at the existing maximum', () => {
    expect(approvalDurationForLease(60 * 60_000)).toBe(28 * 60_000);
  });

  it('leaves a valid approval window for short leases', () => {
    expect(approvalDurationForLease(10_000)).toBe(1_000);
    expect(() => approvalDurationForLease(1_000)).toThrow(/exceed one second/i);
  });
});
