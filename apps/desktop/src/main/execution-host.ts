import { randomUUID } from 'node:crypto';

import type { JobCoordinator } from '@causaic/coordinator-core';
import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  MessageIdSchema,
} from '@causaic/protocol';
import type {
  ContributionOpportunitySummary,
  ExecutorId,
  LeaseId,
  NodeId,
  RunId,
  UserId,
} from '@causaic/protocol';
import {
  LocalRunnerService,
  WorkflowArtifactValidator,
} from '@causaic/runner-core';
import type {
  ApprovalProvider,
  LocalArtifactStore,
  RunningExecution,
  RunnerIdFactory,
  RunnerEvent,
} from '@causaic/runner-core';
import { RuntimeSessionIdSchema } from '@causaic/runtime-core';
import type { AgentRuntimeAdapter } from '@causaic/runtime-core';

import { DesktopError } from '../shared/errors.js';
import { DesktopArtifactStore } from './persistence/artifact-store.js';
import { JournaledJobCoordinator } from './persistence/journaled-coordinator.js';
import type { LocalExecutionId } from './persistence/models.js';
import type { DesktopRepositories } from './persistence/repositories.js';

export interface DesktopExecutionStartContext {
  readonly executionId: LocalExecutionId;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly afterEvent: (event: RunnerEvent) => Promise<void>;
}

export interface DesktopExecutionHost {
  start(
    opportunity: ContributionOpportunitySummary,
    context: DesktopExecutionStartContext,
  ): Promise<RunningExecution>;
}

export interface InProcessExecutionHostOptions {
  readonly coordinator: JobCoordinator;
  readonly runtime: AgentRuntimeAdapter;
  readonly approvalProvider: ApprovalProvider;
  readonly artifactStore?: LocalArtifactStore;
  readonly repositories?: DesktopRepositories;
  readonly artifactRoot?: string;
  readonly nodeId: NodeId;
  readonly executorId: ExecutorId;
  readonly contributorId: UserId;
  readonly leaseDurationMs: number;
  readonly approvalExpiresInMs?: number;
  readonly now?: () => number;
  readonly createId?: () => string;
}

const MAXIMUM_APPROVAL_DURATION_MS = 28 * 60_000;
const APPROVAL_LEASE_BUFFER_MS = 30_000;

export function approvalDurationForLease(leaseDurationMs: number): number {
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs <= 1_000)
    throw new DesktopError(
      'configuration_invalid',
      'The desktop lease duration must exceed one second.',
    );
  return Math.min(
    MAXIMUM_APPROVAL_DURATION_MS,
    Math.max(1_000, leaseDurationMs - APPROVAL_LEASE_BUFFER_MS),
  );
}

export class InProcessExecutionHost implements DesktopExecutionHost {
  readonly #runtime: AgentRuntimeAdapter;
  readonly #options: InProcessExecutionHostOptions;

  public constructor(options: InProcessExecutionHostOptions) {
    this.#options = options;
    this.#runtime = options.runtime;
  }

  public async start(
    opportunity: ContributionOpportunitySummary,
    context: DesktopExecutionStartContext,
  ): Promise<RunningExecution> {
    const installation = (await this.#runtime.detect()).find(
      ({ available }) => available,
    );
    if (installation === undefined)
      throw new DesktopError(
        'internal_failure',
        'No compatible local runtime is available.',
      );
    const createId = this.#options.createId ?? randomUUID;
    const ids: RunnerIdFactory = {
      approvalId: () => ApprovalIdSchema.parse(`approval_${createId()}`),
      artifactId: () => ArtifactIdSchema.parse(`artifact_${createId()}`),
      sessionId: () =>
        RuntimeSessionIdSchema.parse(`runtime-session_${createId()}`),
      messageId: (purpose, sequence) =>
        MessageIdSchema.parse(
          `message_${purpose}-${sequence ?? 'single'}-${createId()}`,
        ),
    };
    const coordinator =
      this.#options.repositories === undefined
        ? this.#options.coordinator
        : new JournaledJobCoordinator(
            this.#options.coordinator,
            this.#options.repositories,
            context.executionId,
          );
    const artifactStore =
      this.#options.repositories !== undefined &&
      this.#options.artifactRoot !== undefined
        ? new DesktopArtifactStore({
            rootDirectory: this.#options.artifactRoot,
            repositories: this.#options.repositories,
            executionId: context.executionId,
            jobId: () => {
              const jobId = this.#options.repositories?.execution(
                context.executionId,
              )?.jobId;
              if (jobId === undefined || jobId === null)
                throw new DesktopError(
                  'internal_failure',
                  'The claimed job is not available for artifact storage.',
                );
              return jobId;
            },
            runId: () =>
              this.#options.repositories?.execution(context.executionId)
                ?.runId ?? undefined,
            ...(this.#options.now === undefined
              ? {}
              : { now: this.#options.now }),
            createId,
          })
        : this.#options.artifactStore;
    if (artifactStore === undefined)
      throw new DesktopError(
        'configuration_invalid',
        'No local artifact store is configured.',
      );
    const service = new LocalRunnerService({
      coordinator,
      runtime: this.#options.runtime,
      approvalProvider: this.#options.approvalProvider,
      artifactValidator: new WorkflowArtifactValidator(),
      artifactStore,
      ids,
      now: this.#options.now ?? Date.now,
      afterEvent: context.afterEvent,
    });
    return service.start({
      opportunity,
      leaseId: context.leaseId,
      runId: context.runId,
      installation,
      executorId: this.#options.executorId,
      nodeId: this.#options.nodeId,
      contributorId: this.#options.contributorId,
      executorType: 'desktop_node',
      leaseDurationMs: this.#options.leaseDurationMs,
      approvalExpiresInMs:
        this.#options.approvalExpiresInMs ??
        approvalDurationForLease(this.#options.leaseDurationMs),
    });
  }
}
