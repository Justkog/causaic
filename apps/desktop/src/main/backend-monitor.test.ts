import type { JobCoordinator } from '@causaic/coordinator-core';
import {
  ContributionOpportunitySummarySchema,
  validContributionOpportunitySummaryFixture,
} from '@causaic/protocol';
import { describe, expect, it, vi } from 'vitest';

import { BackendMonitor } from './backend-monitor.js';
import { DesktopStateStore } from './state.js';

const opportunity = ContributionOpportunitySummarySchema.parse(
  validContributionOpportunitySummaryFixture,
);

describe('BackendMonitor', () => {
  it('keeps last-known opportunities and marks them stale after a failure', async () => {
    const listAvailableOpportunities = vi
      .fn<
        Pick<JobCoordinator, 'listAvailableOpportunities'>['listAvailableOpportunities']
      >()
      .mockResolvedValueOnce([opportunity])
      .mockRejectedValueOnce(new Error('network unavailable'));
    const state = new DesktopStateStore();
    const monitor = new BackendMonitor({
      coordinator: { listAvailableOpportunities },
      state,
      now: () => Date.parse('2030-01-01T12:00:00Z'),
    });
    await monitor.refresh();
    expect(state.get().connection.status).toBe('connected');
    await monitor.refresh();
    expect(state.get()).toMatchObject({
      connection: { status: 'temporarily_unavailable', stale: true },
      availableOpportunities: [opportunity],
    });
  });

  it('does not notify for the initial baseline or while paused', async () => {
    const onNewOpportunities = vi.fn();
    const coordinator = {
      listAvailableOpportunities: vi.fn().mockResolvedValue([opportunity]),
    };
    const state = new DesktopStateStore();
    const monitor = new BackendMonitor({
      coordinator,
      state,
      onNewOpportunities,
    });
    await monitor.refresh();
    expect(onNewOpportunities).not.toHaveBeenCalled();
    state.update((current) => ({
      ...current,
      availableOpportunities: [],
      paused: true,
    }));
    await monitor.refresh();
    expect(onNewOpportunities).not.toHaveBeenCalled();
  });

  it('stays connected when post-connect recovery fails', async () => {
    const state = new DesktopStateStore();
    const monitor = new BackendMonitor({
      coordinator: {
        listAvailableOpportunities: vi.fn().mockResolvedValue([opportunity]),
      },
      state,
      onConnected: vi.fn().mockRejectedValue(new Error('recovery failed')),
    });

    await monitor.refresh();

    expect(state.get()).toMatchObject({
      connection: { status: 'connected', stale: false },
      availableOpportunities: [opportunity],
    });
  });
});
