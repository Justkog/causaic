import {
  JobIdSchema,
  OpportunityIdSchema,
  validContributionOpportunitySummaryFixture,
} from '@causaic/protocol';
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

const opportunity = validContributionOpportunitySummaryFixture;

function state(value: Partial<DesktopState> = {}): DesktopState {
  return DesktopStateSchema.parse({
    ...initialDesktopState(),
    revision: 1,
    connection: { status: 'connected', stale: false },
    availableOpportunities: [opportunity],
    ...value,
  });
}

function installApi(initial: DesktopState) {
  let stateListener: ((next: DesktopState) => void) | undefined;
  const startExecution = vi.fn(async () => initial);
  const api: CausaicDesktopApi = {
    getState: async () => initial,
    refreshOpportunities: async () => initial,
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

  it('hydrates available opportunities and requires confirmation before starting', async () => {
    const user = userEvent.setup();
    const { startExecution } = installApi(state());
    render(
      <DesktopStateProvider>
        <App />
      </DesktopStateProvider>,
    );
    expect(await screen.findByText(opportunity.objective)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /review and start/i }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(startExecution).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: /start contribution/i }),
    );
    expect(startExecution).toHaveBeenCalledWith({
      opportunityId: opportunity.id,
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
    await screen.findByText(opportunity.objective);
    await user.click(screen.getByRole('button', { name: /^execution$/i }));
    expect(screen.getByText(/no active execution/i)).toBeVisible();
    installed.push(
      state({
        revision: 2,
        currentExecution: {
          opportunityId: OpportunityIdSchema.parse(opportunity.id),
          jobId: JobIdSchema.parse('job_runner-core-test'),
          objective: opportunity.objective,
          campaignName: opportunity.campaign.name,
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
