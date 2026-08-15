import type { JobCoordinator } from '@causaic/coordinator-core';

import { DesktopError } from '../shared/errors.js';
import type { DesktopStateStore } from './state.js';

export interface BackendMonitorOptions {
  readonly coordinator: Pick<JobCoordinator, 'listAvailableJobs'>;
  readonly state: DesktopStateStore;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly onNewJobs?: (count: number) => void;
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

  public assertCanStart(jobId: string): void {
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
    if (!state.availableJobs.some(({ job }) => job.id === jobId))
      throw new DesktopError(
        'job_stale',
        'This job is no longer available. Refresh the job list.',
      );
  }

  async #performRefresh(): Promise<void> {
    const before = this.#options.state.get();
    let offers: Awaited<ReturnType<JobCoordinator['listAvailableJobs']>>;
    try {
      offers = await this.#options.coordinator.listAvailableJobs({
        executorType: 'desktop_node',
      });
    } catch {
      this.#options.state.update((state) => ({
        ...state,
        connection: {
          status: 'temporarily_unavailable',
          stale: state.availableJobs.length > 0,
          message: 'The local coordinator is temporarily unavailable.',
        },
      }));
      return;
    }

    const previousIds = new Set(before.availableJobs.map(({ job }) => job.id));
    const newCount = offers.filter(
      ({ job }) => !previousIds.has(job.id),
    ).length;
    this.#options.state.update((state) => ({
      ...state,
      connection: { status: 'connected', stale: false },
      availableJobs: [...offers],
      refreshedAt: new Date(this.#options.now?.() ?? Date.now()).toISOString(),
    }));
    if (this.#hasBaseline && !before.paused && newCount > 0)
      this.#options.onNewJobs?.(newCount);
    this.#hasBaseline = true;

    try {
      await this.#options.onConnected?.();
    } catch {
      // Recovery owns its separate state. A recovery failure must not turn a
      // successful availability query into a backend connection failure.
    }
  }
}
