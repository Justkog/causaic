import {
  ApprovalDecisionSchema,
  PreparedValidationSessionSchema,
  PreparedSessionSchema,
  RuntimeAdapterError,
  RuntimeEventSchema,
  RuntimeInstallationIdSchema,
  RuntimeSessionContextSchema,
  RuntimeSessionIdSchema,
  ValidationRuntimeEventSchema,
  ValidationRuntimeSessionContextSchema,
} from '@causaic/runtime-core';
import type { AgentTaskDefinition } from '@causaic/protocol';
import type {
  AgentRuntimeAdapter,
  AgentValidationRuntimeAdapter,
  ApprovalDecision,
  PreparedSession,
  RuntimeEvent,
  RuntimeInstallation,
  RuntimeSessionContext,
  PreparedValidationSession,
  ValidationRuntimeEvent,
  ValidationRuntimeSessionContext,
} from '@causaic/runtime-core';

export type FakeFailureCheckpoint = 'preparation' | 'verification' | 'artifact';

export interface FakeRuntimeFailureConfig {
  readonly checkpoint: FakeFailureCheckpoint;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface FakeRuntimeConfig {
  readonly failure?: FakeRuntimeFailureConfig;
}

type SessionStatus = 'prepared' | 'executing' | 'completed';

interface PendingApproval {
  readonly approvalId: ApprovalDecision['approvalId'];
  decision?: ApprovalDecision;
  wake?: (result: ApprovalDecision | 'cancelled') => void;
}

interface FakeSessionState {
  readonly prepared: PreparedSession;
  status: SessionStatus;
  pendingApproval?: PendingApproval | undefined;
  resolvedDecision?: ApprovalDecision | undefined;
}

interface FakeValidationSessionState {
  readonly prepared: PreparedValidationSession;
  status: SessionStatus;
}

type EventPayload<Event> = Event extends RuntimeEvent
  ? Omit<Event, 'sessionId' | 'sequence'>
  : never;
type RuntimeEventPayload = EventPayload<RuntimeEvent>;
type ValidationEventPayload<Event> = Event extends ValidationRuntimeEvent
  ? Omit<Event, 'sessionId' | 'sequence'>
  : never;
type ValidationRuntimeEventPayload =
  ValidationEventPayload<ValidationRuntimeEvent>;

const installation: RuntimeInstallation = {
  id: RuntimeInstallationIdSchema.parse('runtime-installation_fake'),
  runtimeType: 'fake',
  displayName: 'Causaic Fake Runtime',
  version: '2.0.0',
  available: true,
};

function fakeCompatibilityIssues(task: AgentTaskDefinition): readonly string[] {
  const issues: string[] = [];
  if (
    !task.supportedExecutionModes.some(
      (mode) =>
        mode.type === 'managed_agent' && mode.runtimeTypes.includes('fake'),
    )
  )
    issues.push('The fake managed-agent runtime is not declared.');
  return issues;
}

function sameDecision(
  left: ApprovalDecision,
  right: ApprovalDecision,
): boolean {
  return (
    left.approvalId === right.approvalId &&
    left.decision === right.decision &&
    (left.decision === 'approved' ||
      (right.decision === 'denied' && left.reason === right.reason))
  );
}

export class FakeRuntimeAdapter
  implements AgentRuntimeAdapter, AgentValidationRuntimeAdapter
{
  private readonly sessions = new Map<string, FakeSessionState>();
  private readonly validationSessions = new Map<
    string,
    FakeValidationSessionState
  >();

  public constructor(private readonly config: FakeRuntimeConfig = {}) {}

  public supports(
    selectedInstallation: RuntimeInstallation,
    task: AgentTaskDefinition,
  ): boolean {
    return (
      selectedInstallation.runtimeType === 'fake' &&
      fakeCompatibilityIssues(task).length === 0
    );
  }

  public async detect(): Promise<RuntimeInstallation[]> {
    return [installation];
  }

  public async prepareSession(
    context: RuntimeSessionContext,
  ): Promise<PreparedSession> {
    const validated = RuntimeSessionContextSchema.parse(context);
    const prepared = PreparedSessionSchema.parse({
      ...validated,
      runtimeType: 'fake',
    });
    const existing = this.sessions.get(prepared.sessionId);
    if (existing !== undefined) {
      if (JSON.stringify(existing.prepared) === JSON.stringify(prepared)) {
        return existing.prepared;
      }
      throw new RuntimeAdapterError(
        'session_conflict',
        `Session ${prepared.sessionId} was prepared with different context`,
      );
    }
    this.sessions.set(prepared.sessionId, { prepared, status: 'prepared' });
    return prepared;
  }

  public async *execute(
    session: PreparedSession,
    signal: AbortSignal,
  ): AsyncIterable<RuntimeEvent> {
    const validated = PreparedSessionSchema.parse(session);
    const state = this.sessions.get(validated.sessionId);
    if (state === undefined) {
      throw new RuntimeAdapterError(
        'unknown_session',
        `Unknown session ${validated.sessionId}`,
      );
    }
    if (state.status !== 'prepared') {
      throw new RuntimeAdapterError(
        'session_already_executed',
        `Session ${validated.sessionId} has already executed`,
      );
    }
    state.status = 'executing';
    let sequence = 0;
    const event = (value: RuntimeEventPayload) =>
      RuntimeEventSchema.parse({
        ...value,
        sessionId: validated.sessionId,
        sequence: sequence++,
      });
    const cancelled = () =>
      event({ type: 'session.cancelled', reason: 'Execution aborted' });
    const failed = (failure: FakeRuntimeFailureConfig) =>
      event({
        type: 'session.failed',
        failure: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        },
      });

    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }

    yield event({
      type: 'session.started',
      installationId: validated.installationId,
    });
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }
    yield event({ type: 'phase.changed', phase: 'preparing' });
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }
    yield event({
      type: 'progress',
      message: 'Reading source from example.gov',
    });
    if (this.config.failure?.checkpoint === 'preparation') {
      state.status = 'completed';
      yield failed(this.config.failure);
      return;
    }
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }

    state.pendingApproval = { approvalId: validated.approvalId };
    yield event({
      type: 'approval.requested',
      request: {
        id: validated.approvalId,
        type: 'network_access',
        domain: 'example.gov',
        reason: 'Read the public source needed to verify the claim',
      },
    });

    const decision = await this.waitForApproval(state, signal);
    if (decision === 'cancelled') {
      state.pendingApproval = undefined;
      state.status = 'completed';
      yield cancelled();
      return;
    }
    state.pendingApproval = undefined;
    state.resolvedDecision = decision;
    if (decision.decision === 'denied') {
      state.status = 'completed';
      yield event({
        type: 'session.failed',
        failure: {
          code: 'approval_denied',
          message: decision.reason,
          retryable: false,
        },
      });
      return;
    }
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }

    yield event({ type: 'phase.changed', phase: 'verifying' });
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }
    yield event({
      type: 'progress',
      message: 'Verifying the claim against the approved source',
    });
    if (this.config.failure?.checkpoint === 'verification') {
      state.status = 'completed';
      yield failed(this.config.failure);
      return;
    }
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }

    const input = validated.job.input;
    const claim =
      input !== null && typeof input === 'object' && !Array.isArray(input)
        ? (input as { readonly claim?: unknown }).claim
        : undefined;
    if (typeof claim !== 'string')
      throw new RuntimeAdapterError(
        'session_conflict',
        'The fake Source Verification runtime requires a string claim',
      );
    const artifact = {
      artifactType: 'source_verification' as const,
      claim,
      verdict: 'supported' as const,
      citations: [
        {
          url: 'https://example.gov/source',
          note: 'The deterministic fake source supports the fixture claim.',
        },
      ],
    };
    yield event({
      type: 'artifact.created',
      artifactId: validated.artifactId,
      artifact,
    });
    if (this.config.failure?.checkpoint === 'artifact') {
      state.status = 'completed';
      yield failed(this.config.failure);
      return;
    }
    if (signal.aborted) {
      state.status = 'completed';
      yield cancelled();
      return;
    }

    state.status = 'completed';
    yield event({
      type: 'session.completed',
      artifactId: validated.artifactId,
    });
  }

  public async resolveApproval(
    sessionId: string,
    decision: ApprovalDecision,
  ): Promise<void> {
    const validatedSessionId = RuntimeSessionIdSchema.parse(sessionId);
    const validatedDecision = ApprovalDecisionSchema.parse(decision);
    const state = this.sessions.get(validatedSessionId);
    if (state === undefined) {
      throw new RuntimeAdapterError(
        'unknown_session',
        `Unknown session ${validatedSessionId}`,
      );
    }
    if (state.resolvedDecision !== undefined) {
      if (sameDecision(state.resolvedDecision, validatedDecision)) return;
      throw new RuntimeAdapterError(
        'approval_already_resolved',
        `Approval for ${validatedSessionId} has already been resolved`,
      );
    }
    const pending = state.pendingApproval;
    if (pending === undefined) {
      throw new RuntimeAdapterError(
        'approval_not_pending',
        `Session ${validatedSessionId} is not awaiting approval`,
      );
    }
    if (pending.approvalId !== validatedDecision.approvalId) {
      throw new RuntimeAdapterError(
        'approval_mismatch',
        `Approval ${validatedDecision.approvalId} does not match the pending request`,
      );
    }
    pending.decision = validatedDecision;
    pending.wake?.(validatedDecision);
  }

  public async prepareValidationSession(
    context: ValidationRuntimeSessionContext,
  ): Promise<PreparedValidationSession> {
    const validated = ValidationRuntimeSessionContextSchema.parse(context);
    const prepared = PreparedValidationSessionSchema.parse({
      ...validated,
      runtimeType: 'fake',
    });
    const existing = this.validationSessions.get(prepared.sessionId);
    if (existing !== undefined) {
      if (JSON.stringify(existing.prepared) === JSON.stringify(prepared))
        return existing.prepared;
      throw new RuntimeAdapterError(
        'session_conflict',
        `Validation session ${prepared.sessionId} has conflicting context`,
      );
    }
    this.validationSessions.set(prepared.sessionId, {
      prepared,
      status: 'prepared',
    });
    return prepared;
  }

  public async *executeValidation(
    session: PreparedValidationSession,
    signal: AbortSignal,
  ): AsyncIterable<ValidationRuntimeEvent> {
    const validated = PreparedValidationSessionSchema.parse(session);
    const state = this.validationSessions.get(validated.sessionId);
    if (state === undefined)
      throw new RuntimeAdapterError(
        'unknown_session',
        `Unknown validation session ${validated.sessionId}`,
      );
    if (state.status !== 'prepared')
      throw new RuntimeAdapterError(
        'session_already_executed',
        `Validation session ${validated.sessionId} has already executed`,
      );
    state.status = 'executing';
    let sequence = 0;
    const event = (value: ValidationRuntimeEventPayload) =>
      ValidationRuntimeEventSchema.parse({
        ...value,
        sessionId: validated.sessionId,
        sequence: sequence++,
      });
    if (signal.aborted) {
      state.status = 'completed';
      yield event({
        type: 'validation.cancelled',
        reason: 'Validation aborted',
      });
      return;
    }
    yield event({
      type: 'validation.started',
      installationId: validated.installationId,
    });
    yield event({
      type: 'validation.progress',
      message: 'Reviewing the artifact against the original job input',
    });
    const jobInput = validated.input.job.input;
    const artifact = validated.input.artifact.content;
    const inputClaim =
      jobInput !== null &&
      typeof jobInput === 'object' &&
      !Array.isArray(jobInput)
        ? (jobInput as { claim?: unknown }).claim
        : undefined;
    const artifactClaim =
      artifact !== null &&
      typeof artifact === 'object' &&
      !Array.isArray(artifact)
        ? (artifact as { claim?: unknown }).claim
        : undefined;
    state.status = 'completed';
    yield event({
      type: 'validation.completed',
      result:
        typeof inputClaim === 'string' && inputClaim === artifactClaim
          ? {
              decision: 'accept',
              summary: 'The deterministic artifact matches the original claim.',
              issues: [],
            }
          : {
              decision: 'needs_review',
              summary:
                'The artifact claim does not match the original job input.',
              issues: [
                {
                  severity: 'error',
                  target: 'artifact',
                  instancePath: '/claim',
                  code: 'claim_mismatch',
                  message: 'Artifact claim must match the original claim.',
                },
              ],
            },
    });
  }

  private async waitForApproval(
    state: FakeSessionState,
    signal: AbortSignal,
  ): Promise<ApprovalDecision | 'cancelled'> {
    const pending = state.pendingApproval;
    if (pending === undefined) {
      throw new RuntimeAdapterError(
        'approval_not_pending',
        'The fake runtime lost its pending approval',
      );
    }
    if (pending.decision !== undefined) return pending.decision;
    if (signal.aborted) return 'cancelled';
    return new Promise((resolve) => {
      const onAbort = () => resolve('cancelled');
      pending.wake = (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
