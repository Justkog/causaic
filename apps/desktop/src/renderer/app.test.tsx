import { JobOfferSchema, validJobOfferFixture } from '@causaic/protocol';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CausaicDesktopApi, DesktopState } from '../shared/contracts.js';
import {
  DesktopStateSchema,
  initialDesktopState,
} from '../shared/contracts.js';
import { App } from './app.js';
import { DesktopStateProvider } from './state-provider.js';

const offer = JobOfferSchema.parse(validJobOfferFixture);

function state(value: Partial<DesktopState> = {}): DesktopState {
  return DesktopStateSchema.parse({
    ...initialDesktopState(),
    revision: 1,
    connection: { status: 'connected', stale: false },
    availableJobs: [offer],
    ...value,
  });
}

function installApi(initial: DesktopState) {
  let stateListener: ((next: DesktopState) => void) | undefined;
  const startExecution = vi.fn(async () => initial);
  const api: CausaicDesktopApi = {
    getState: async () => initial,
    refreshJobs: async () => initial,
    startExecution,
    cancelExecution: async () => initial,
    resolveApproval: async () => initial,
    setPaused: async () => initial,
    setSelectedView: async () => initial,
    openExternal: async () => undefined,
    resetLocalState: async () => undefined,
    quit: async () => undefined,
    onStateChanged: (listener) => {
      stateListener = listener;
      return () => {
        stateListener = undefined;
      };
    },
    onFocusTarget: () => () => undefined,
  };
  Object.defineProperty(window, 'causaicDesktop', {
    configurable: true,
    value: api,
  });
  return {
    startExecution,
    push: (next: DesktopState) => stateListener?.(next),
  };
}

describe('desktop renderer', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('hydrates available jobs and requires confirmation before starting', async () => {
    const user = userEvent.setup();
    const { startExecution } = installApi(state());
    render(
      <DesktopStateProvider>
        <App />
      </DesktopStateProvider>,
    );
    expect(await screen.findByText(offer.job.objective)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /review and start/i }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(startExecution).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: /start contribution/i }),
    );
    expect(startExecution).toHaveBeenCalledWith({
      jobId: offer.job.id,
    });
  });

  it('replaces the view reactively without remounting', async () => {
    const user = userEvent.setup();
    const installed = installApi(state());
    render(
      <DesktopStateProvider>
        <App />
      </DesktopStateProvider>,
    );
    await screen.findByText(offer.job.objective);
    await user.click(screen.getByRole('button', { name: /^execution$/i }));
    expect(screen.getByText(/no active execution/i)).toBeVisible();
    installed.push(
      state({
        revision: 2,
        currentExecution: {
          jobId: offer.job.id,
          objective: offer.job.objective,
          campaignName: offer.campaign.name,
          status: 'running',
          startedAt: '2030-01-01T12:00:00Z',
          progressMessage: 'Reading public source',
          events: [],
        },
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('Reading public source')).toBeVisible(),
    );
  });
});
