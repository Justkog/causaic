import type { JobCoordinator } from '@causaic/coordinator-core';

import { DesktopError } from '../shared/errors.js';
import type { DesktopStateStore } from './state.js';

export interface BackendMonitorOptions {
  readonly coordinator: Pick<JobCoordinator, 'listAvailableOpportunities'>;
  readonly state: DesktopStateStore;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly onNewOpportunities?: (count: number) => void;
  readonly onConnected?: () => void | Promise<void>;
}

export class BackendMonitor {
  readonly #options: BackendMonitorOptions;
  #timer: ReturnType<typeof setInterval> | undefined;
  #refreshing: Promise<void> | undefined;
  #hasBaseline = false;

  public constructor(options: BackendMonitorOptions) {
    this.#options = options;
  }

  public start(): void {
    if (this.#timer !== undefined) return;
    void this.refresh();
    this.#timer = setInterval(
      () => void this.refresh(),
      this.#options.pollIntervalMs ?? 5_000,
    );
  }

  public stop(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  public async refresh(): Promise<void> {
    if (this.#refreshing !== undefined) return this.#refreshing;
    this.#refreshing = this.#performRefresh().finally(() => {
      this.#refreshing = undefined;
    });
    return this.#refreshing;
  }

  public assertCanStart(opportunityId: string): void {
    const state = this.#options.state.get();
    if (state.paused)
      throw new DesktopError(
        'backend_unavailable',
        'New contributions are paused.',
      );
    if (state.connection.status !== 'connected' || state.connection.stale)
      throw new DesktopError(
        'backend_unavailable',
        'The local coordinator is not currently available.',
      );
    if (!state.availableOpportunities.some(({ id }) => id === opportunityId))
      throw new DesktopError(
        'opportunity_stale',
        'This opportunity is no longer available. Refresh the opportunity list.',
      );
  }

  async #performRefresh(): Promise<void> {
    const before = this.#options.state.get();
    let opportunities: Awaited<
      ReturnType<JobCoordinator['listAvailableOpportunities']>
    >;
    try {
      opportunities = await this.#options.coordinator.listAvailableOpportunities({
        executorType: 'desktop_node',
      });
    } catch {
      this.#options.state.update((state) => ({
        ...state,
        connection: {
          status: 'temporarily_unavailable',
          stale: state.availableOpportunities.length > 0,
          message: 'The local coordinator is temporarily unavailable.',
        },
      }));
      return;
    }

    const previousIds = new Set(before.availableOpportunities.map(({ id }) => id));
    const newCount = opportunities.filter(({ id }) => !previousIds.has(id)).length;
    this.#options.state.update((state) => ({
      ...state,
      connection: { status: 'connected', stale: false },
      availableOpportunities: [...opportunities],
      refreshedAt: new Date(this.#options.now?.() ?? Date.now()).toISOString(),
    }));
    if (this.#hasBaseline && !before.paused && newCount > 0)
      this.#options.onNewOpportunities?.(newCount);
    this.#hasBaseline = true;

    try {
      await this.#options.onConnected?.();
    } catch {
      // Recovery owns its separate state. A recovery failure must not turn a
      // successful availability query into a backend connection failure.
    }
  }
}
