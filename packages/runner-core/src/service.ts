import {
  ApprovalDecisionSchema,
  JobProgressEventSchema,
} from '@causaic/protocol';
import type {
  ArtifactId,
  ExecutableWorkflowDefinition,
  JobDefinition,
  JobId,
  JobLease,
  JobState,
  RunId,
  RunFailure,
} from '@causaic/protocol';
import { RuntimeEventSchema } from '@causaic/runtime-core';
import type {
  AgentRuntimeAdapter,
  RuntimeEvent,
  RuntimeInstallation,
} from '@causaic/runtime-core';

import { RunnerExecutionError, runnerError } from './errors.js';
import type { RunnerLifecycleStage } from './errors.js';
import { RunnerEventStream } from './events.js';
import type { RunnerEvent } from './events.js';
import type {
  ArtifactOutput,
  CancelledExecutionResult,
  CompletedExecutionResult,
  ExecutionResult,
  RunnerDependencies,
  RunnerService,
  RunningExecution,
  StartExecutionRequest,
  ValidatedArtifact,
} from './types.js';

type RunnerEventInput = RunnerEvent extends infer Event
  ? Event extends RunnerEvent
    ? Omit<Event, 'sequence' | 'occurredAt'>
    : never
  : never;

interface MutableExecutionState {
  stage: RunnerLifecycleStage;
  claimAttempted: boolean;
  job?: JobDefinition;
  lease?: JobLease;
  runStarted: boolean;
  approvalDenied: boolean;
  artifact?: ValidatedArtifact;
  artifactId?: ArtifactId;
  output?: ArtifactOutput;
  lastPhase?: 'preparing' | 'verifying';
  lastProgressMessage?: string;
  artifactSubmissionConfirmed: boolean;
  workflowDefinition?: ExecutableWorkflowDefinition;
}

class ExecutionEmitter {
  #sequence = 0;

  public constructor(
    private readonly stream: RunnerEventStream,
    private readonly now: () => number,
    private readonly afterEvent:
      ((event: RunnerEvent) => Promise<void>) | undefined,
  ) {}

  public async emit(event: RunnerEventInput): Promise<void> {
    const emitted = {
      ...event,
      sequence: this.#sequence++,
      occurredAt: new Date(this.now()).toISOString(),
    } as RunnerEvent;
    this.stream.emit(emitted);
    await this.afterEvent?.(emitted);
  }
}

function runtimeFingerprint(event: RuntimeEvent): string {
  return JSON.stringify(event);
}

function failureFor(error: RunnerExecutionError): RunFailure {
  return {
    kind:
      error.stage === 'artifact_validation'
        ? 'invalid_workflow_output'
        : error.stage === 'artifact_submission'
          ? 'artifact_upload_failed'
          : 'runtime_crashed',
    retryable: error.retryable,
    code: error.code,
    message: error.message,
  };
}

function assertRuntimeCompatibility(
  definition: ExecutableWorkflowDefinition,
  runtime: AgentRuntimeAdapter,
  installation: RuntimeInstallation,
  expected: StartExecutionRequest['opportunity']['workflow']['reference'],
): void {
  if (
    definition.workflowVersionId !== expected.id ||
    definition.workflowFamilyId !== expected.workflowFamilyId ||
    definition.definitionHash !== expected.definitionHash ||
    definition.packageHash !== expected.packageHash ||
    definition.execution.inputSchema.descriptor.hash !==
      expected.inputSchemaHash ||
    definition.execution.outputSchema.descriptor.hash !==
      expected.outputSchemaHash
  )
    throw new RunnerExecutionError(
      'workflow_definition_mismatch',
      'selection',
      false,
      'Resolved workflow definition does not match the immutable job reference',
    );
  if (!runtime.supports(installation, definition.execution))
    throw new RunnerExecutionError(
      'runtime_incompatible',
      'selection',
      false,
      `Runtime ${installation.runtimeType} cannot satisfy this workflow definition`,
    );
}

export class LocalRunnerService implements RunnerService {
  public constructor(private readonly dependencies: RunnerDependencies) {}

  public start(request: StartExecutionRequest): RunningExecution {
    const stream = new RunnerEventStream();
    const controller = new AbortController();
    let cancellationReason = 'Execution cancelled by caller';
    const abortFromCaller = () => {
      if (typeof request.signal?.reason === 'string')
        cancellationReason = request.signal.reason;
      controller.abort(request.signal?.reason);
    };
    if (request.signal?.aborted === true) abortFromCaller();
    else
      request.signal?.addEventListener('abort', abortFromCaller, {
        once: true,
      });

    const result = this.#execute(
      request,
      controller,
      stream,
      () => cancellationReason,
    ).finally(() => {
      request.signal?.removeEventListener('abort', abortFromCaller);
      stream.close();
    });

    return {
      events: stream,
      result,
      cancel: async (reason?: string) => {
        if (reason !== undefined && reason.trim() !== '')
          cancellationReason = reason;
        controller.abort(cancellationReason);
        await result;
      },
    };
  }

  async #execute(
    request: StartExecutionRequest,
    controller: AbortController,
    stream: RunnerEventStream,
    cancellationReason: () => string,
  ): Promise<ExecutionResult> {
    const { coordinator, runtime } = this.dependencies;
    const emitter = new ExecutionEmitter(
      stream,
      this.dependencies.now,
      this.dependencies.afterEvent,
    );
    const state: MutableExecutionState = {
      stage: 'selection',
      claimAttempted: false,
      runStarted: false,
      approvalDenied: false,
      artifactSubmissionConfirmed: false,
    };
    let terminalEmitted = false;
    const terminal = async (event: RunnerEventInput) => {
      if (terminalEmitted) return;
      terminalEmitted = true;
      await emitter.emit(event);
    };
    let jobId: JobId | undefined;

    try {
      this.#throwIfCancelled(controller.signal, state.stage);
      state.claimAttempted = true;
      const claimed = await coordinator.claimOpportunity({
        opportunityId: request.opportunity.id,
        leaseId: request.leaseId,
        runId: request.runId,
        nodeId: request.nodeId,
        executorId: request.executorId,
        contributorId: request.contributorId,
        executorType: request.executorType,
        durationMs: request.leaseDurationMs,
      });
      state.job = claimed.job;
      state.lease = claimed.lease;
      jobId = claimed.job.id;
      await emitter.emit({
        type: 'opportunity.claimed',
        opportunityId: request.opportunity.id,
        jobId,
      });
      state.workflowDefinition = await coordinator.getWorkflowDefinition({
        jobId,
        workflowVersionId: claimed.job.workflow.id,
      });
      assertRuntimeCompatibility(
        state.workflowDefinition,
        runtime,
        request.installation,
        claimed.job.workflow,
      );
      if (!request.installation.available)
        throw new RunnerExecutionError(
          'runtime_unavailable',
          'selection',
          true,
          `Runtime ${request.installation.id} is unavailable`,
        );
      await emitter.emit({
        type: 'runtime.selected',
        installation: request.installation,
      });
      this.#throwIfCancelled(controller.signal, state.stage);

      await emitter.emit({
        type: 'lease.acquired',
        leaseId: state.lease.id,
        runId: state.lease.runId,
      });
      this.#throwIfCancelled(controller.signal, state.stage);

      state.stage = 'starting_run';
      await coordinator.startRun({
        jobId: claimed.job.id,
        leaseId: state.lease.id,
        runId: state.lease.runId,
      });
      state.runStarted = true;
      await emitter.emit({ type: 'run.started', runId: state.lease.runId });
      this.#throwIfCancelled(controller.signal, state.stage);

      const approvalId = this.dependencies.ids.approvalId();
      const expectedArtifactId = this.dependencies.ids.artifactId();
      state.stage = 'preparing_runtime';
      const session = await runtime.prepareSession({
        sessionId: this.dependencies.ids.sessionId(),
        installationId: request.installation.id,
        job: claimed.job,
        workflowDefinition: state.workflowDefinition,
        runId: state.lease.runId,
        approvalId,
        artifactId: expectedArtifactId,
      });
      state.stage = 'executing_runtime';

      const fingerprints = new Map<number, string>();
      let highestRuntimeSequence = -1;
      for await (const rawEvent of runtime.execute(
        session,
        controller.signal,
      )) {
        if (
          typeof rawEvent === 'object' &&
          rawEvent !== null &&
          'type' in rawEvent &&
          rawEvent.type === 'artifact.created'
        )
          state.stage = 'artifact_validation';
        const event = RuntimeEventSchema.parse(rawEvent);
        state.stage = 'executing_runtime';
        const fingerprint = runtimeFingerprint(event);
        const existing = fingerprints.get(event.sequence);
        if (existing !== undefined) {
          if (existing === fingerprint) continue;
          throw new RunnerExecutionError(
            'runtime_sequence_conflict',
            'executing_runtime',
            false,
            `Runtime sequence ${event.sequence} was reused with different content`,
          );
        }
        if (event.sequence < highestRuntimeSequence) continue;
        fingerprints.set(event.sequence, fingerprint);
        highestRuntimeSequence = event.sequence;

        const outcome = await this.#consumeRuntimeEvent({
          request,
          event,
          leaseId: state.lease.id,
          runId: state.lease.runId,
          sessionId: session.sessionId,
          emitter,
          state,
          signal: controller.signal,
        });
        if (outcome !== undefined) {
          await terminal(
            outcome.status === 'completed'
              ? {
                  type: 'execution.completed',
                  job: outcome.job,
                  artifactId: outcome.artifactId,
                }
              : {
                  type: 'execution.cancelled',
                  ...(outcome.job === undefined ? {} : { job: outcome.job }),
                  reason: outcome.reason,
                },
          );
          return outcome;
        }
      }
      this.#throwIfCancelled(controller.signal, state.stage);
      throw new RunnerExecutionError(
        'runtime_ended_without_terminal_event',
        'executing_runtime',
        false,
        'Runtime stream ended without completion, cancellation, or failure',
      );
    } catch (caught) {
      const cancelled = controller.signal.aborted;
      const primary = runnerError(caught, state.stage, {
        ...(cancelled
          ? { code: 'execution_cancelled' }
          : state.stage === 'artifact_validation'
            ? { code: 'artifact_invalid' }
            : {}),
        ...(cancelled ? { message: cancellationReason() } : {}),
        retryable: cancelled || state.stage !== 'artifact_validation',
      });
      const recovered = await this.#recover(
        state,
        primary,
        cancelled,
        cancellationReason(),
      );
      if (recovered.status === 'completed') {
        await terminal({
          type: 'execution.completed',
          job: recovered.job,
          artifactId: recovered.artifactId,
        });
      } else if (recovered.status === 'cancelled') {
        await terminal({
          type: 'execution.cancelled',
          ...(recovered.job === undefined ? {} : { job: recovered.job }),
          reason: recovered.reason,
        });
      } else {
        await terminal({
          type: 'execution.failed',
          code: recovered.error.code,
          message: recovered.error.message,
          retryable: recovered.error.retryable,
        });
      }
      return recovered;
    }
  }

  async #consumeRuntimeEvent(input: {
    readonly request: StartExecutionRequest;
    readonly event: RuntimeEvent;
    readonly leaseId: JobLease['id'];
    readonly runId: RunId;
    readonly sessionId: string;
    readonly emitter: ExecutionEmitter;
    readonly state: MutableExecutionState;
    readonly signal: AbortSignal;
  }): Promise<CompletedExecutionResult | CancelledExecutionResult | undefined> {
    const { coordinator, runtime } = this.dependencies;
    const { event, emitter, leaseId, runId, state } = input;
    const jobId = state.job?.id;
    if (jobId === undefined)
      throw new RunnerExecutionError(
        'job_unavailable',
        'selection',
        false,
        'The claimed contribution job is missing',
      );
    const report = async (
      progress:
        | {
            readonly eventType: 'phase.changed';
            readonly status: 'running' | 'validating';
          }
        | { readonly eventType: 'progress.reported'; readonly message: string },
    ) => {
      await coordinator.reportProgress({
        leaseId,
        event: JobProgressEventSchema.parse({
          protocolVersion: 1,
          messageType: 'job.progress',
          messageId: this.dependencies.ids.messageId(
            'progress',
            event.sequence,
          ),
          jobId,
          runId,
          sequence: event.sequence,
          occurredAt: new Date(this.dependencies.now()).toISOString(),
          ...progress,
        }),
      });
    };

    switch (event.type) {
      case 'session.started':
        return undefined;
      case 'phase.changed': {
        if (state.lastPhase === event.phase) return undefined;
        state.lastPhase = event.phase;
        if (event.phase === 'preparing') {
          await report({ eventType: 'phase.changed', status: 'running' });
          await emitter.emit({ type: 'phase.changed', phase: 'preparing' });
        } else {
          await report({ eventType: 'phase.changed', status: 'validating' });
          await emitter.emit({ type: 'phase.changed', phase: 'validating' });
        }
        return undefined;
      }
      case 'progress':
        if (state.lastProgressMessage === event.message) return undefined;
        state.lastProgressMessage = event.message;
        await report({
          eventType: 'progress.reported',
          message: event.message,
        });
        await emitter.emit({
          type: 'progress',
          message: event.message,
          runtimeSequence: event.sequence,
        });
        return undefined;
      case 'approval.requested': {
        state.stage = 'approval';
        await coordinator.requestApproval({
          leaseId,
          runId,
          approvalId: event.request.id,
          approvalType: event.request.type,
          reason: event.request.reason,
          expiresInMs: input.request.approvalExpiresInMs,
        });
        await emitter.emit({
          type: 'approval.requested',
          approvalId: event.request.id,
          domain: event.request.domain,
          reason: event.request.reason,
        });
        const answer = await this.dependencies.approvalProvider.requestDecision(
          event.request,
          input.signal,
        );
        this.#throwIfCancelled(input.signal, 'approval');
        const decision = ApprovalDecisionSchema.parse({
          protocolVersion: 1,
          messageType: 'approval.decision',
          messageId: this.dependencies.ids.messageId('approval'),
          approvalId: event.request.id,
          decision: answer.decision,
          ...(answer.decision === 'denied' ? { reason: answer.reason } : {}),
          decidedAt: new Date(this.dependencies.now()).toISOString(),
        });
        await coordinator.resolveApproval({ leaseId, decision });
        await emitter.emit({
          type: 'approval.resolved',
          approvalId: event.request.id,
          decision: answer.decision,
          ...(answer.decision === 'denied' ? { reason: answer.reason } : {}),
        });
        if (answer.decision === 'denied') state.approvalDenied = true;
        await runtime.resolveApproval(
          input.sessionId,
          answer.decision === 'denied'
            ? {
                approvalId: event.request.id,
                decision: 'denied',
                reason: answer.reason,
              }
            : { approvalId: event.request.id, decision: 'approved' },
        );
        state.stage = 'executing_runtime';
        return undefined;
      }
      case 'artifact.created': {
        state.stage = 'artifact_validation';
        if (state.workflowDefinition === undefined)
          throw new RunnerExecutionError(
            'workflow_definition_missing',
            'artifact_validation',
            false,
            'The pinned workflow definition was not resolved',
          );
        state.artifact = await this.dependencies.artifactValidator.validate(
          event.artifact,
          state.workflowDefinition,
        );
        state.artifactId = event.artifactId;
        state.stage = 'artifact_persistence';
        state.output = await this.dependencies.artifactStore.persist(
          event.artifactId,
          state.artifact.content,
          state.artifact.contentHash,
          state.workflowDefinition,
        );
        this.#throwIfCancelled(input.signal, 'artifact_persistence');
        await emitter.emit({
          type: 'artifact.produced',
          artifactId: event.artifactId,
          artifact: state.artifact.content,
          output: state.output,
        });
        state.stage = 'executing_runtime';
        return undefined;
      }
      case 'session.completed': {
        if (
          state.artifact === undefined ||
          state.artifactId !== event.artifactId ||
          state.output === undefined
        )
          throw new RunnerExecutionError(
            'artifact_mismatch',
            'artifact_validation',
            false,
            'Runtime completed without the matching validated artifact',
          );
        state.stage = 'artifact_submission';
        const submitted = await coordinator.submitArtifact({
          jobId,
          leaseId,
          runId,
          artifactId: event.artifactId,
          contentHash: state.artifact.contentHash,
          content: state.artifact.content,
        });
        state.artifactSubmissionConfirmed = true;
        await emitter.emit({
          type: 'artifact.submitted',
          artifactId: submitted.id,
        });
        this.#throwIfCancelled(input.signal, 'artifact_submission');
        state.stage = 'completion';
        await coordinator.completeRun({
          jobId,
          leaseId,
          runId,
          artifactId: submitted.id,
        });
        return {
          status: 'completed',
          job: await coordinator.getJobState({
            jobId,
          }),
          artifact: state.artifact.content,
          artifactId: submitted.id,
          output: state.output,
        };
      }
      case 'session.cancelled': {
        await coordinator.releaseLease({ leaseId });
        return {
          status: 'cancelled',
          job: await coordinator.getJobState({
            jobId,
          }),
          reason: event.reason,
        };
      }
      case 'session.failed': {
        if (state.approvalDenied && event.failure.code === 'approval_denied')
          return {
            status: 'cancelled',
            job: await coordinator.getJobState({
              jobId,
            }),
            reason: event.failure.message,
          };
        throw new RunnerExecutionError(
          event.failure.code,
          'executing_runtime',
          event.failure.retryable,
          event.failure.message,
        );
      }
    }
  }

  async #recover(
    state: MutableExecutionState,
    primary: RunnerExecutionError,
    cancelled: boolean,
    cancellationReason: string,
  ): Promise<ExecutionResult> {
    const { coordinator } = this.dependencies;
    let job: JobState | undefined;
    let cleanupError: unknown;
    try {
      const claimedJobId = state.job?.id;
      if (claimedJobId !== undefined) {
        job = await coordinator.getJobState({ jobId: claimedJobId });
        if (state.lease !== undefined) {
          if (
            (job.status === 'completed' ||
              (job.status === 'validating' &&
                job.run?.status === 'completed' &&
                job.lease?.status === 'released')) &&
            state.artifact !== undefined &&
            state.artifactId !== undefined &&
            state.output !== undefined
          )
            return {
              status: 'completed',
              job,
              artifact: state.artifact.content,
              artifactId: state.artifactId,
              output: state.output,
            };

          if (job.lease?.status === 'active') {
            if (cancelled || !state.runStarted)
              await coordinator.releaseLease({ leaseId: state.lease.id });
            else
              await coordinator.failRun({
                leaseId: state.lease.id,
                runId: state.lease.runId,
                failure: failureFor(primary),
              });
            job = await coordinator.getJobState({ jobId: claimedJobId });
          }
        }
      }
    } catch (error) {
      cleanupError = error;
    }

    if (cancelled && !state.claimAttempted)
      return { status: 'cancelled', reason: cancellationReason };
    if (cancelled && job !== undefined)
      return { status: 'cancelled', job, reason: cancellationReason };
    return {
      status: 'failed',
      ...(job === undefined ? {} : { job }),
      ...(state.artifact === undefined ||
      state.artifactId === undefined ||
      state.output === undefined
        ? {}
        : {
            recovery: {
              artifactId: state.artifactId,
              artifact: state.artifact.content,
              contentHash: state.artifact.contentHash,
              output: state.output,
              submissionConfirmed: state.artifactSubmissionConfirmed,
            },
          }),
      error:
        cleanupError === undefined
          ? primary
          : new RunnerExecutionError(
              primary.code,
              primary.stage,
              primary.retryable,
              primary.message,
              { cause: primary.cause, cleanupError },
            ),
    };
  }

  #throwIfCancelled(signal: AbortSignal, stage: RunnerLifecycleStage): void {
    if (signal.aborted)
      throw new RunnerExecutionError(
        'execution_cancelled',
        stage,
        true,
        typeof signal.reason === 'string'
          ? signal.reason
          : 'Execution cancelled by caller',
      );
  }
}
