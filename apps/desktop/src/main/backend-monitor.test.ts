import type { JobCoordinator } from '@causaic/coordinator-core';
import { JobOfferSchema, validJobOfferFixture } from '@causaic/protocol';
import { describe, expect, it, vi } from 'vitest';

import { BackendMonitor } from './backend-monitor.js';
import { DesktopStateStore } from './state.js';

const offer = JobOfferSchema.parse({
  ...validJobOfferFixture,
  job: {
    ...validJobOfferFixture.job,
    supportedExecutorTypes: ['desktop_node', 'plugin_host'],
  },
});

describe('BackendMonitor', () => {
  it('keeps last-known jobs and marks them stale after a failure', async () => {
    const listAvailableJobs = vi
      .fn<Pick<JobCoordinator, 'listAvailableJobs'>['listAvailableJobs']>()
      .mockResolvedValueOnce([offer])
      .mockRejectedValueOnce(new Error('network unavailable'));
    const state = new DesktopStateStore();
    const monitor = new BackendMonitor({
      coordinator: { listAvailableJobs },
      state,
      now: () => Date.parse('2030-01-01T12:00:00Z'),
    });
    await monitor.refresh();
    expect(state.get().connection.status).toBe('connected');
    await monitor.refresh();
    expect(state.get()).toMatchObject({
      connection: { status: 'temporarily_unavailable', stale: true },
      availableJobs: [offer],
    });
  });

  it('does not notify for the initial baseline or while paused', async () => {
    const onNewJobs = vi.fn();
    const coordinator = {
      listAvailableJobs: vi.fn().mockResolvedValue([offer]),
    };
    const state = new DesktopStateStore();
    const monitor = new BackendMonitor({ coordinator, state, onNewJobs });
    await monitor.refresh();
    expect(onNewJobs).not.toHaveBeenCalled();
    state.update((current) => ({
      ...current,
      availableJobs: [],
      paused: true,
    }));
    await monitor.refresh();
    expect(onNewJobs).not.toHaveBeenCalled();
  });

  it('stays connected when post-connect recovery fails', async () => {
    const state = new DesktopStateStore();
    const monitor = new BackendMonitor({
      coordinator: { listAvailableJobs: vi.fn().mockResolvedValue([offer]) },
      state,
      onConnected: vi.fn().mockRejectedValue(new Error('recovery failed')),
    });

    await monitor.refresh();

    expect(state.get()).toMatchObject({
      connection: { status: 'connected', stale: false },
      availableJobs: [offer],
    });
  });
});
