import { validContributionOpportunitySummaryFixture } from '@causaic/protocol';
import { describe, expect, it } from 'vitest';

import {
  DesktopStateSchema,
  ResolveApprovalRequestSchema,
  initialDesktopState,
} from './contracts.js';

describe('desktop IPC contracts', () => {
  it('accepts source-neutral opportunities and rejects unknown fields', () => {
    expect(
      DesktopStateSchema.parse({
        ...initialDesktopState(),
        availableOpportunities: [validContributionOpportunitySummaryFixture],
      }).availableOpportunities,
    ).toHaveLength(1);
    expect(() =>
      DesktopStateSchema.parse({ ...initialDesktopState(), secret: 'nope' }),
    ).toThrow();
  });

  it('requires a denial reason and validates portable approval IDs', () => {
    expect(
      ResolveApprovalRequestSchema.safeParse({
        approvalId: 'approval_desktop-test',
        decision: 'denied',
      }).success,
    ).toBe(false);
    expect(
      ResolveApprovalRequestSchema.safeParse({
        approvalId: 'approval_desktop-test',
        decision: 'approved',
      }).success,
    ).toBe(true);
  });

  it('distinguishes local storage failure from backend unavailability', () => {
    const state = DesktopStateSchema.parse({
      ...initialDesktopState(),
      connection: {
        status: 'failed_local_storage',
        stale: false,
        message: 'Local desktop storage is unavailable.',
      },
    });

    expect(state.connection.status).toBe('failed_local_storage');
  });
});
