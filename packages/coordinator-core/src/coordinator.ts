import type {
  ApprovalDecision,
  ApprovalId,
  ApprovalRequest,
  ArtifactId,
  ArtifactManifest,
  Campaign,
  ExecutorId,
  ExecutorType,
  JobId,
  JobLease,
  JobOffer,
  JobProgressEvent,
  JobState,
  JsonValue,
  LeaseId,
  NodeId,
  RunId,
  RunFailure,
  ExecutableWorkflowDefinition,
  UserId,
  WorkflowVersionId,
} from '@causaic/protocol';

export interface ListAvailableJobsRequest {
  readonly executorType?: ExecutorType;
}

export interface AcquireLeaseRequest {
  readonly jobId: JobId;
  readonly nodeId: NodeId;
  readonly executorId: ExecutorId;
  readonly contributorId: UserId;
  readonly executorType: ExecutorType;
  readonly durationMs: number;
}

export interface StartRunRequest {
  readonly jobId: JobId;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
}

export interface JobRun {
  readonly id: RunId;
  readonly jobId: JobId;
  readonly leaseId: LeaseId;
  readonly status: NonNullable<JobState['run']>['status'];
  readonly startedAt: string;
}

export interface ReportProgressRequest {
  readonly leaseId: LeaseId;
  readonly event: JobProgressEvent;
}

export interface CreateApprovalRequest {
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly approvalId?: ApprovalId;
  readonly approvalType?: ApprovalRequest['approvalType'];
  readonly reason: string;
  readonly expiresInMs: number;
}

export interface ResolveApprovalRequest {
  readonly leaseId: LeaseId;
  readonly decision: ApprovalDecision;
}

export interface SubmitArtifactRequest {
  readonly jobId: JobId;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly artifactId?: ArtifactId;
  readonly contentHash: ArtifactManifest['contentHash'];
  readonly content: JsonValue;
}

export interface GetWorkflowDefinitionRequest {
  readonly jobId: JobId;
  readonly workflowVersionId: WorkflowVersionId;
}

export type ArtifactRecord = ArtifactManifest;

export interface CompleteRunRequest {
  readonly jobId: JobId;
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly artifactId: ArtifactId;
}

export interface FailRunRequest {
  readonly leaseId: LeaseId;
  readonly runId: RunId;
  readonly failure: RunFailure;
}

export interface ReleaseLeaseRequest {
  readonly leaseId: LeaseId;
  readonly retryable?: boolean;
}

export interface RenewLeaseRequest {
  readonly leaseId: LeaseId;
  readonly durationMs: number;
}

export interface RecoveryLease {
  readonly id: LeaseId;
  readonly jobId: JobId;
  readonly runId: RunId;
  readonly nodeId: NodeId;
  readonly executorId: ExecutorId;
  readonly contributorId: UserId;
  readonly executorType: ExecutorType;
  readonly status: JobLease['status'];
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly expiresAt: string;
  readonly releasedAt?: string;
}

export interface RecoveryRun {
  readonly id: RunId;
  readonly jobId: JobId;
  readonly leaseId: LeaseId;
  readonly nodeId: NodeId;
  readonly status: JobRun['status'];
  readonly progressSequence: number;
  readonly currentPhase?: string;
  readonly progressMessage?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly failureType?:
    'retryable' | 'final' | 'cancelled' | 'provider_capacity_exhausted';
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly acceptedArtifactId?: ArtifactId;
}

export interface RecoveryApproval {
  readonly id: ApprovalId;
  readonly runId: RunId;
  readonly leaseId: LeaseId;
  readonly status: 'pending' | 'approved' | 'denied';
  readonly reason: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly resolvedAt?: string;
  readonly denialReason?: string;
}

export interface RecoveryArtifact {
  readonly id: ArtifactId;
  readonly jobId: JobId;
  readonly runId: RunId;
  readonly contentHash: ArtifactManifest['contentHash'];
  readonly status:
    'submitted' | 'validating' | 'awaiting_review' | 'accepted' | 'rejected';
  readonly createdAt: string;
}

export interface JobRecoverySnapshot {
  readonly job: JobState & {
    readonly workflowVersionId: WorkflowVersionId;
  };
  readonly leases: readonly RecoveryLease[];
  readonly runs: readonly RecoveryRun[];
  readonly approvals: readonly RecoveryApproval[];
  readonly artifacts: readonly RecoveryArtifact[];
}

export interface GetRecoverySnapshotRequest {
  readonly jobId: JobId;
}

export interface ListNodeActiveExecutionsRequest {
  readonly nodeId: NodeId;
  readonly limit: number;
}

export interface GetJobStateRequest {
  readonly jobId: JobId;
}

export interface CoordinatorFixtures {
  readonly campaigns: readonly Campaign[];
  readonly jobs: readonly JobOffer['job'][];
  readonly workflowDefinitions?: readonly ExecutableWorkflowDefinition[];
}

export interface JobCoordinator {
  listAvailableJobs(
    request: ListAvailableJobsRequest,
  ): Promise<readonly JobOffer[]>;
  acquireLease(request: AcquireLeaseRequest): Promise<JobLease>;
  startRun(request: StartRunRequest): Promise<JobRun>;
  reportProgress(request: ReportProgressRequest): Promise<void>;
  requestApproval(request: CreateApprovalRequest): Promise<ApprovalRequest>;
  resolveApproval(request: ResolveApprovalRequest): Promise<void>;
  submitArtifact(request: SubmitArtifactRequest): Promise<ArtifactRecord>;
  getWorkflowDefinition(
    request: GetWorkflowDefinitionRequest,
  ): Promise<ExecutableWorkflowDefinition>;
  completeRun(request: CompleteRunRequest): Promise<void>;
  failRun(request: FailRunRequest): Promise<void>;
  releaseLease(request: ReleaseLeaseRequest): Promise<void>;
  renewLease(request: RenewLeaseRequest): Promise<JobLease>;
  getJobState(request: GetJobStateRequest): Promise<JobState>;
  getRecoverySnapshot(
    request: GetRecoverySnapshotRequest,
  ): Promise<JobRecoverySnapshot>;
  listNodeActiveExecutions(
    request: ListNodeActiveExecutionsRequest,
  ): Promise<readonly JobRecoverySnapshot[]>;
}
