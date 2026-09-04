import type { JobCoordinator } from '@causaic/coordinator-core';
import type { LeaseId, NodeId } from '@causaic/protocol';

import { JournaledJobCoordinator } from '../persistence/journaled-coordinator.js';
import type { LocalExecutionId } from '../persistence/models.js';
import type { DesktopRepositories } from '../persistence/repositories.js';

export interface RenewalScheduler {
  schedule(operation: () => void | Promise<void>, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

const defaultScheduler: RenewalScheduler = {
  schedule: (operation, delayMs) => setTimeout(() => void operation(), delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface LeaseRenewalOptions {
  readonly coordinator: JobCoordinator;
  readonly repositories: DesktopRepositories;
  readonly nodeId: NodeId;
  readonly durationMs: number;
  readonly now?: () => number;
  readonly scheduler?: RenewalScheduler;
}

export class LeaseRenewalService {
  readonly #options: LeaseRenewalOptions;
  #handle: unknown;
  #generation = 0;

  public constructor(options: LeaseRenewalOptions) {
    this.#options = options;
  }

  public async start(
    executionId: LocalExecutionId,
    leaseId: LeaseId,
    onOwnershipLost: () => void | Promise<void>,
  ): Promise<void> {
    this.stop();
    const generation = ++this.#generation;
    const execution = this.#options.repositories.execution(executionId);
    if (execution === undefined) return;
    if (execution.jobId === null) {
      await onOwnershipLost();
      return;
    }
    const snapshot = await this.#options.coordinator.getRecoverySnapshot({
      jobId: execution.jobId,
    });
    const lease = snapshot.leases.find(({ id }) => id === leaseId);
    if (lease?.status !== 'active' || lease.nodeId !== this.#options.nodeId) {
      await onOwnershipLost();
      return;
    }
    this.#schedule(
      executionId,
      leaseId,
      Date.parse(lease.expiresAt),
      generation,
      onOwnershipLost,
    );
  }

  public stop(): void {
    this.#generation += 1;
    if (this.#handle !== undefined) {
      (this.#options.scheduler ?? defaultScheduler).cancel(this.#handle);
      this.#handle = undefined;
    }
  }

  #schedule(
    executionId: LocalExecutionId,
    leaseId: LeaseId,
    expiresAt: number,
    generation: number,
    onOwnershipLost: () => void | Promise<void>,
  ): void {
    const now = this.#options.now?.() ?? Date.now();
    const delay = Math.max(
      1_000,
      Math.min(
        Math.floor(this.#options.durationMs / 3),
        60_000,
        expiresAt - now - 30_000,
      ),
    );
    this.#handle = (this.#options.scheduler ?? defaultScheduler).schedule(
      () =>
        this.#renew(
          executionId,
          leaseId,
          expiresAt,
          generation,
          onOwnershipLost,
        ),
      delay,
    );
  }

  async #renew(
    executionId: LocalExecutionId,
    leaseId: LeaseId,
    previousExpiry: number,
    generation: number,
    onOwnershipLost: () => void | Promise<void>,
  ): Promise<void> {
    if (generation !== this.#generation) return;
    const coordinator = new JournaledJobCoordinator(
      this.#options.coordinator,
      this.#options.repositories,
      executionId,
    );
    try {
      const renewed = await coordinator.renewLease({
        leaseId,
        durationMs: this.#options.durationMs,
      });
      if (generation !== this.#generation) return;
      this.#schedule(
        executionId,
        leaseId,
        Date.parse(renewed.expiresAt),
        generation,
        onOwnershipLost,
      );
    } catch {
      const execution = this.#options.repositories.execution(executionId);
      if (execution === undefined) return;
      if (execution.jobId === null) {
        await onOwnershipLost();
        return;
      }
      try {
        const snapshot = await this.#options.coordinator.getRecoverySnapshot({
          jobId: execution.jobId,
        });
        const lease = snapshot.leases.find(({ id }) => id === leaseId);
        const now = this.#options.now?.() ?? Date.now();
        if (
          lease?.status !== 'active' ||
          lease.nodeId !== this.#options.nodeId ||
          Date.parse(lease.expiresAt) <= now
        ) {
          await onOwnershipLost();
          return;
        }
        this.#schedule(
          executionId,
          leaseId,
          Math.min(previousExpiry, Date.parse(lease.expiresAt)),
          generation,
          onOwnershipLost,
        );
      } catch {
        const now = this.#options.now?.() ?? Date.now();
        if (previousExpiry <= now) await onOwnershipLost();
        else
          this.#schedule(
            executionId,
            leaseId,
            previousExpiry,
            generation,
            onOwnershipLost,
          );
      }
    }
  }
}
