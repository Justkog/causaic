import type { JobCoordinator } from '@causaic/coordinator-core';
import type {
  ApprovalId,
  ArtifactId,
  ArtifactManifest,
  ContributionOpportunitySummary,
  ExecutableWorkflowDefinition,
  ExecutorId,
  ExecutorType,
  JobId,
  JobState,
  LeaseId,
  MessageId,
  NodeId,
  RunId,
  JsonValue,
  UserId,
} from '@causaic/protocol';
import type {
  AgentRuntimeAdapter,
  RuntimeApprovalRequest,
  RuntimeInstallation,
  RuntimeSessionId,
} from '@causaic/runtime-core';

import type { RunnerEvent } from './events.js';
import type { RunnerExecutionError } from './errors.js';

export interface ApprovalProvider {
  requestDecision(
    request: RuntimeApprovalRequest,
    signal: AbortSignal,
  ): Promise<
    | { readonly decision: 'approved' }
    | { readonly decision: 'denied'; readonly reason: string }
  >;
}

export interface ValidatedArtifact {
  readonly content: JsonValue;
  readonly contentHash: ArtifactManifest['contentHash'];
}

export interface ArtifactValidator {
  validate(
    value: unknown,
    definition: ExecutableWorkflowDefinition,
  ): ValidatedArtifact | Promise<ValidatedArtifact>;
}

export interface ArtifactOutput {
  readonly directory: string;
  readonly path: string;
}

export interface LocalArtifactStore {
  persist(
    artifactId: ArtifactId,
    artifact: JsonValue,
    contentHash: ArtifactManifest['contentHash'],
    definition: ExecutableWorkflowDefinition,
  ): Promise<ArtifactOutput>;
}

export interface RunnerIdFactory {
  approvalId(): ApprovalId;
  artifactId(): ArtifactId;
  sessionId(): RuntimeSessionId;
  messageId(purpose: string, sequence?: number): MessageId;
}

export interface RunnerDependencies {
  readonly coordinator: JobCoordinator;
  readonly runtime: AgentRuntimeAdapter;
  readonly approvalProvider: ApprovalProvider;
  readonly artifactValidator: ArtifactValidator;
  readonly artifactStore: LocalArtifactStore;
  readonly ids: RunnerIdFactory;
  readonly now: () => number;
  readonly afterEvent?: (event: RunnerEvent) => Promise<void>;
}

export interface StartExecutionRequest {
  readonly opportunity: ContributionOpportunitySummary;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly installation: RuntimeInstallation;
  readonly executorId: ExecutorId;
  readonly nodeId: NodeId;
  readonly contributorId: UserId;
  readonly executorType: ExecutorType;
  readonly leaseDurationMs: number;
  readonly approvalExpiresInMs: number;
  readonly signal?: AbortSignal;
}

export interface CompletedExecutionResult {
  readonly status: 'completed';
  readonly job: JobState;
  readonly artifact: JsonValue;
  readonly artifactId: ArtifactId;
  readonly output: ArtifactOutput;
}

export interface CancelledExecutionResult {
  readonly status: 'cancelled';
  readonly job?: JobState;
  readonly reason: string;
}

export interface FailedExecutionResult {
  readonly status: 'failed';
  readonly job?: JobState;
  readonly error: RunnerExecutionError;
  readonly recovery?: {
    readonly artifactId: ArtifactId;
    readonly artifact: JsonValue;
    readonly contentHash: ArtifactManifest['contentHash'];
    readonly output: ArtifactOutput;
    readonly submissionConfirmed: boolean;
  };
}

export type ExecutionResult =
  CompletedExecutionResult | CancelledExecutionResult | FailedExecutionResult;

export interface RunningExecution {
  readonly events: AsyncIterable<RunnerEvent>;
  readonly result: Promise<ExecutionResult>;
  cancel(reason?: string): Promise<void>;
}

export interface RunnerService {
  start(request: StartExecutionRequest): RunningExecution;
}

export interface ExecutionContext {
  readonly jobId: JobId;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
}
