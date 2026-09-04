import type {
  ApprovalId,
  ArtifactId,
  JobId,
  JobState,
  OpportunityId,
  LeaseId,
  RunId,
  JsonValue,
} from '@causaic/protocol';
import type { RuntimeInstallation } from '@causaic/runtime-core';

import type { ArtifactOutput } from './types.js';

interface RunnerEventBase {
  readonly sequence: number;
  readonly occurredAt: string;
}

export type RunnerEvent =
  | (RunnerEventBase & {
      readonly type: 'opportunity.claimed';
      readonly opportunityId: OpportunityId;
      readonly jobId: JobId;
    })
  | (RunnerEventBase & {
      readonly type: 'runtime.selected';
      readonly installation: RuntimeInstallation;
    })
  | (RunnerEventBase & {
      readonly type: 'lease.acquired';
      readonly leaseId: LeaseId;
      readonly runId: RunId;
    })
  | (RunnerEventBase & { readonly type: 'run.started'; readonly runId: RunId })
  | (RunnerEventBase & {
      readonly type: 'phase.changed';
      readonly phase: 'preparing' | 'running' | 'validating';
    })
  | (RunnerEventBase & {
      readonly type: 'progress';
      readonly message: string;
      readonly runtimeSequence: number;
    })
  | (RunnerEventBase & {
      readonly type: 'approval.requested';
      readonly approvalId: ApprovalId;
      readonly domain: string;
      readonly reason: string;
    })
  | (RunnerEventBase & {
      readonly type: 'approval.resolved';
      readonly approvalId: ApprovalId;
      readonly decision: 'approved' | 'denied';
      readonly reason?: string;
    })
  | (RunnerEventBase & {
      readonly type: 'artifact.produced';
      readonly artifactId: ArtifactId;
      readonly artifact: JsonValue;
      readonly output: ArtifactOutput;
    })
  | (RunnerEventBase & {
      readonly type: 'artifact.submitted';
      readonly artifactId: ArtifactId;
    })
  | (RunnerEventBase & {
      readonly type: 'execution.completed';
      readonly job: JobState;
      readonly artifactId: ArtifactId;
    })
  | (RunnerEventBase & {
      readonly type: 'execution.cancelled';
      readonly job?: JobState;
      readonly reason: string;
    })
  | (RunnerEventBase & {
      readonly type: 'execution.failed';
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    });

export class RunnerEventStream implements AsyncIterable<RunnerEvent> {
  readonly #buffer: RunnerEvent[] = [];
  readonly #waiters: Array<(value: IteratorResult<RunnerEvent>) => void> = [];
  #closed = false;
  #consumed = false;

  public emit(event: RunnerEvent): void {
    if (this.#closed) throw new Error('Runner event stream is closed');
    const waiter = this.#waiters.shift();
    if (waiter === undefined) this.#buffer.push(event);
    else waiter({ done: false, value: event });
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0))
      waiter({ done: true, value: undefined });
  }

  public [Symbol.asyncIterator](): AsyncIterator<RunnerEvent> {
    if (this.#consumed)
      throw new Error('A running execution event stream supports one consumer');
    this.#consumed = true;
    return {
      next: () => {
        const event = this.#buffer.shift();
        if (event !== undefined)
          return Promise.resolve({ done: false, value: event });
        if (this.#closed)
          return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}
