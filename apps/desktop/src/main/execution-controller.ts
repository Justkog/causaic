import { randomUUID } from 'node:crypto';

import { LeaseIdSchema, RunIdSchema } from '@causaic/protocol';
import type { ExecutorId, NodeId, OpportunityId } from '@causaic/protocol';
import type {
  ExecutionResult,
  RunnerEvent,
  RunningExecution,
} from '@causaic/runner-core';
import type { RuntimeApprovalRequest } from '@causaic/runtime-core';

import type {
  DesktopExecutionEvent,
  DesktopState,
  ResolveApprovalRequest,
} from '../shared/contracts.js';
import { DesktopError } from '../shared/errors.js';
import type { ElectronApprovalProvider } from './approval-provider.js';
import type { BackendMonitor } from './backend-monitor.js';
import type { DesktopExecutionHost } from './execution-host.js';
import type { DesktopStateStore } from './state.js';
import { LocalExecutionIdSchema } from './persistence/models.js';
import type { LocalExecutionId } from './persistence/models.js';
import type { DesktopRepositories } from './persistence/repositories.js';
import type { LeaseRenewalService } from './recovery/lease-renewal.js';

export type DesktopNotificationKind =
  | 'execution_started'
  | 'approval_required'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface ActiveExecution {
  readonly executionId: LocalExecutionId;
  readonly opportunityId: OpportunityId;
  readonly running: RunningExecution;
  readonly done: Promise<void>;
}

export interface ExecutionControllerOptions {
  readonly state: DesktopStateStore;
  readonly monitor: BackendMonitor;
  readonly host: DesktopExecutionHost;
  readonly approvalProvider: ElectronApprovalProvider;
  readonly now?: () => number;
  readonly redact?: (message: string) => string;
  readonly notify?: (kind: DesktopNotificationKind) => void;
  readonly cancelRecovered?: () => Promise<void>;
  readonly leaseRenewal?: LeaseRenewalService;
  readonly persistence?: {
    readonly repositories: DesktopRepositories;
    readonly nodeId: NodeId;
    readonly executorId: ExecutorId;
    readonly runtimeType: string;
  };
}

function eventMessage(event: RunnerEvent): string {
  switch (event.type) {
    case 'opportunity.claimed':
      return 'Opportunity claimed';
    case 'runtime.selected':
      return `Using ${event.installation.displayName}`;
    case 'lease.acquired':
      return 'Lease acquired';
    case 'run.started':
      return 'Run started';
    case 'phase.changed':
      return `Phase changed to ${event.phase}`;
    case 'progress':
      return event.message;
    case 'approval.requested':
      return `Approval required for ${event.domain}`;
    case 'approval.resolved':
      return `Approval ${event.decision}`;
    case 'artifact.produced':
      return 'Artifact produced and stored locally';
    case 'artifact.submitted':
      return 'Artifact submitted';
    case 'execution.completed':
      return 'Execution completed';
    case 'execution.cancelled':
      return event.reason;
    case 'execution.failed':
      return event.message;
  }
}

function safeEvent(
  event: RunnerEvent,
  redact: (message: string) => string,
): DesktopExecutionEvent {
  return {
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    type: event.type,
    message: redact(eventMessage(event)),
  };
}

export class DesktopExecutionController {
  readonly #options: ExecutionControllerOptions;
  #active: ActiveExecution | undefined;

  public constructor(options: ExecutionControllerOptions) {
    this.#options = options;
  }

  public async start(opportunityId: OpportunityId): Promise<DesktopState> {
    const desktopState = this.#options.state.get();
    if (
      this.#active !== undefined ||
      desktopState.currentExecution !== null ||
      desktopState.recovery.status === 'recovering' ||
      desktopState.recovery.status === 'failed' ||
      desktopState.recovery.status === 'attention_required'
    )
      throw new DesktopError(
        'execution_active',
        'Another execution is already active.',
      );
    this.#options.monitor.assertCanStart(opportunityId);
    const opportunity = this.#options.state
      .get()
      .availableOpportunities.find(({ id }) => id === opportunityId);
    if (opportunity === undefined)
      throw new DesktopError(
        'opportunity_stale',
        'This opportunity is no longer available. Refresh the opportunity list.',
      );
    const objective = opportunity.objective ?? opportunity.title;

    const startedAt = this.#options.now?.() ?? Date.now();
    const executionId = LocalExecutionIdSchema.parse(
      `local-execution_${randomUUID()}`,
    );
    const leaseId = LeaseIdSchema.parse(`lease_${randomUUID()}`);
    const runId = RunIdSchema.parse(`run_${randomUUID()}`);
    this.#options.persistence?.repositories.createExecution({
      id: executionId,
      opportunityId,
      nodeId: this.#options.persistence.nodeId,
      executorId: this.#options.persistence.executorId,
      runtimeType: this.#options.persistence.runtimeType,
      objective,
      campaignName: opportunity.campaign.name,
      startedAt,
    });
    this.#options.state.update((state) => ({
      ...state,
      currentExecution: {
        opportunityId,
        objective,
        campaignName: opportunity.campaign.name,
        status: 'starting',
        startedAt: new Date(startedAt).toISOString(),
        events: [],
      },
    }));

    let running: RunningExecution;
    try {
      running = await this.#options.host.start(opportunity, {
        executionId,
        leaseId,
        runId,
        afterEvent: async (event) => this.#persistEvent(executionId, event),
      });
    } catch (error) {
      this.#options.state.update((state) => ({
        ...state,
        currentExecution: null,
        recentExecution: {
          opportunityId,
          status: 'failed',
          finishedAt: new Date(
            this.#options.now?.() ?? Date.now(),
          ).toISOString(),
          message: 'The execution could not be started.',
          retryable: true,
        },
      }));
      this.#options.persistence?.repositories.markTerminal(
        executionId,
        'failed',
        {
          code: 'execution_start_failed',
          message: 'The execution could not be started.',
          retryable: true,
        },
      );
      throw new DesktopError(
        'internal_failure',
        'The execution could not be started.',
        { cause: error },
      );
    }

    const eventsDone = this.#consumeEvents(running);
    const done = this.#settle(executionId, opportunityId, running, eventsDone);
    this.#active = { executionId, opportunityId, running, done };
    this.#options.notify?.('execution_started');
    return this.#options.state.get();
  }

  public async cancel(
    reason = 'Cancelled by the contributor',
  ): Promise<DesktopState> {
    const active = this.#active;
    if (active === undefined) {
      if (this.#options.state.get().currentExecution !== null) {
        this.#options.leaseRenewal?.stop();
        await this.#options.cancelRecovered?.();
      }
      return this.#options.state.get();
    }
    this.#options.state.update((state) => ({
      ...state,
      currentExecution:
        state.currentExecution === null
          ? null
          : { ...state.currentExecution, status: 'cancelling' },
    }));
    await active.running.cancel(reason);
    await active.done;
    return this.#options.state.get();
  }

  public resolveApproval(request: ResolveApprovalRequest): DesktopState {
    this.#options.persistence?.repositories.recordApprovalDecision(
      request.approvalId,
      request.decision,
      request.decision === 'denied' ? request.reason : undefined,
    );
    this.#options.approvalProvider.resolve(request);
    return this.#options.state.get();
  }

  public setPendingApproval(request: RuntimeApprovalRequest | undefined): void {
    const active = this.#active;
    const executionId =
      active?.executionId ??
      this.#options.persistence?.repositories.incompleteExecutions().at(-1)?.id;
    if (request !== undefined && executionId !== undefined) {
      const runId =
        this.#options.persistence?.repositories.execution(executionId)?.runId ??
        undefined;
      this.#options.persistence?.repositories.recordApproval({
        id: request.id,
        executionId,
        ...(runId === undefined ? {} : { runId }),
        domain: request.domain,
        reason: request.reason,
        requestedAt: this.#options.now?.() ?? Date.now(),
      });
    }
    this.#options.state.update((state) => {
      if (state.currentExecution === null) return { ...state };
      if (request === undefined) {
        return {
          ...state,
          currentExecution: {
            ...state.currentExecution,
            status: 'running',
            pendingApproval: undefined,
          },
        };
      }
      return {
        ...state,
        currentExecution: {
          ...state.currentExecution,
          status: 'awaiting_approval',
          pendingApproval: {
            id: request.id,
            domain: request.domain,
            reason: request.reason,
            requestedAt: new Date(
              this.#options.now?.() ?? Date.now(),
            ).toISOString(),
          },
        },
      };
    });
    if (request !== undefined) this.#options.notify?.('approval_required');
  }

  public hasActiveExecution(): boolean {
    return this.#active !== undefined;
  }

  async #consumeEvents(running: RunningExecution): Promise<void> {
    for await (const event of running.events) {
      this.#options.state.update((state) => {
        if (state.currentExecution === null) return { ...state };
        const nextEvent = safeEvent(
          event,
          this.#options.redact ?? ((message) => message),
        );
        let status = state.currentExecution.status;
        if (event.type === 'run.started') status = 'running';
        if (event.type === 'phase.changed') status = event.phase;
        if (event.type === 'approval.requested') status = 'awaiting_approval';
        return {
          ...state,
          currentExecution: {
            ...state.currentExecution,
            status,
            ...(event.type === 'opportunity.claimed'
              ? { jobId: event.jobId }
              : {}),
            ...(event.type === 'progress'
              ? { progressMessage: nextEvent.message }
              : {}),
            events: [...state.currentExecution.events, nextEvent].slice(-100),
          },
        };
      });
    }
  }

  async #settle(
    executionId: LocalExecutionId,
    opportunityId: OpportunityId,
    running: RunningExecution,
    eventsDone: Promise<void>,
  ): Promise<void> {
    const result = await running.result;
    await eventsDone;
    this.#options.leaseRenewal?.stop();
    this.#options.state.update((state) => ({
      ...state,
      currentExecution: null,
      recentExecution: this.#recentResult(executionId, opportunityId, result),
    }));
    {
      if (result.status === 'completed')
        this.#options.persistence?.repositories.markTerminal(
          executionId,
          'completed',
        );
      else if (result.status === 'cancelled')
        this.#options.persistence?.repositories.markTerminal(
          executionId,
          'cancelled',
          { message: result.reason },
        );
      else
        this.#options.persistence?.repositories.markTerminal(
          executionId,
          'failed',
          {
            code: result.error.code,
            message: result.error.message,
            retryable: result.error.retryable,
          },
        );
      if (result.status !== 'cancelled' && result.job !== undefined) {
        this.#options.persistence?.repositories.updateExecution(executionId, {
          remoteSnapshotJson: JSON.stringify(result.job),
        });
      }
    }
    this.#active = undefined;
    this.#options.notify?.(
      result.status === 'completed' ? 'completed' : result.status,
    );
    this.#options.persistence?.repositories.markTerminalNotified(executionId);
    await this.#options.monitor.refresh();
  }

  #recentResult(
    executionId: LocalExecutionId,
    opportunityId: OpportunityId,
    result: ExecutionResult,
  ) {
    const jobId =
      result.job?.id ??
      this.#options.persistence?.repositories.execution(executionId)?.jobId ??
      undefined;
    const identity =
      jobId === undefined ? { opportunityId } : { opportunityId, jobId };
    const finishedAt = new Date(
      this.#options.now?.() ?? Date.now(),
    ).toISOString();
    if (result.status === 'completed')
      return {
        ...identity,
        status: 'completed' as const,
        finishedAt,
        message: 'The contribution completed successfully.',
        artifact: {
          id: result.artifactId,
          content: result.artifact,
        },
      };
    if (result.status === 'cancelled')
      return {
        ...identity,
        status: 'cancelled' as const,
        finishedAt,
        message: this.#options.redact?.(result.reason) ?? result.reason,
      };
    return {
      ...identity,
      status: 'failed' as const,
      finishedAt,
      message:
        this.#options.redact?.(result.error.message) ?? result.error.message,
      retryable: result.error.retryable,
    };
  }

  async #persistEvent(
    executionId: LocalExecutionId,
    event: RunnerEvent,
  ): Promise<void> {
    const projected = safeEvent(
      event,
      this.#options.redact ?? ((message) => message),
    );
    this.#options.persistence?.repositories.appendEvent({
      executionId,
      sequence: projected.sequence,
      type: projected.type,
      message: projected.message,
      occurredAt: Date.parse(projected.occurredAt),
    });
    if (
      event.type === 'lease.acquired' &&
      this.#options.leaseRenewal !== undefined
    ) {
      await this.#options.leaseRenewal.start(
        executionId,
        event.leaseId,
        async () => {
          await this.cancel('Lease ownership was lost');
        },
      );
    }
  }
}
