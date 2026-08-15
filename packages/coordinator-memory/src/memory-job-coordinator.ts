import {
  CoordinatorError,
  type AcquireLeaseRequest,
  type ArtifactRecord,
  type CompleteRunRequest,
  type CoordinatorFixtures,
  type CreateApprovalRequest,
  type FailRunRequest,
  type GetJobStateRequest,
  type GetWorkflowDefinitionRequest,
  type GetRecoverySnapshotRequest,
  type JobCoordinator,
  type JobRecoverySnapshot,
  type JobRun,
  type ListAvailableJobsRequest,
  type ListNodeActiveExecutionsRequest,
  type ReleaseLeaseRequest,
  type RenewLeaseRequest,
  type ReportProgressRequest,
  type ResolveApprovalRequest,
  type StartRunRequest,
  type SubmitArtifactRequest,
} from '@causaic/coordinator-core';
import {
  ApprovalIdSchema,
  ApprovalRequestSchema,
  ArtifactIdSchema,
  ArtifactManifestSchema,
  CampaignSchema,
  JobLeaseSchema,
  JobOfferSchema,
  JobProgressEventSchema,
  LeaseIdSchema,
  MessageIdSchema,
  NodeIdSchema,
  RunIdSchema,
  JobDefinitionSchema,
  JobStateSchema,
} from '@causaic/protocol';
import type {
  ApprovalDecision,
  ApprovalRequest,
  ArtifactId,
  Campaign,
  JobId,
  JobLease,
  JobOffer,
  JobStatus,
  JobDefinition,
  JobState,
  RunFailure,
  LeaseId,
  NodeId,
  RunId,
  ExecutableWorkflowDefinition,
} from '@causaic/protocol';

export interface MemoryCoordinatorOptions {
  readonly now: () => number;
  readonly createId: () => string;
  readonly fixtures?: CoordinatorFixtures;
}

interface StoredJob {
  readonly definition: JobDefinition;
  readonly campaign: Campaign;
  state: JobState;
  lastProgressSequence: number;
  readonly progressBySequence: Map<number, string>;
  readonly artifacts: Map<ArtifactId, ArtifactRecord>;
  leaseNodeId?: NodeId;
  leaseHeartbeatAt?: string;
  leaseExecutorType?: JobLease['executorType'];
}

function initialState(job: JobDefinition, campaign: Campaign): JobState {
  const maxAttempts =
    campaign.participationPolicy.maxAttemptsPerContributor ?? 1;
  return JobStateSchema.parse({
    id: job.id,
    campaignId: job.campaignId,
    causeId: job.causeId,
    status: job.status,
    attemptCount: 0,
    retryPolicy: { allowReassignment: maxAttempts > 1, maxAttempts },
  });
}

/** Deterministic public test adapter; the hosted coordinator remains authoritative. */
export class MemoryJobCoordinator implements JobCoordinator {
  private readonly jobs = new Map<JobId, StoredJob>();
  private readonly leaseToJob = new Map<LeaseId, JobId>();
  private readonly runToJob = new Map<RunId, JobId>();
  private readonly workflowDefinitions = new Map<
    string,
    ExecutableWorkflowDefinition
  >();

  public constructor(private readonly options: MemoryCoordinatorOptions) {
    for (const definition of options.fixtures?.workflowDefinitions ?? [])
      this.workflowDefinitions.set(definition.workflowVersionId, definition);
    const campaigns = new Map(
      (options.fixtures?.campaigns ?? []).map((value) => {
        const campaign = CampaignSchema.parse(value);
        return [campaign.id, campaign] as const;
      }),
    );
    for (const value of options.fixtures?.jobs ?? []) {
      const definition = JobDefinitionSchema.parse(value);
      const campaign = campaigns.get(definition.campaignId);
      if (campaign === undefined) {
        throw new CoordinatorError(
          'job_unavailable',
          `Fixture job ${definition.id} has no campaign`,
        );
      }
      this.jobs.set(definition.id, {
        definition,
        campaign,
        state: initialState(definition, campaign),
        lastProgressSequence: -1,
        progressBySequence: new Map(),
        artifacts: new Map(),
      });
    }
  }

  public async listAvailableJobs(
    request: ListAvailableJobsRequest,
  ): Promise<readonly JobOffer[]> {
    return [...this.jobs.values()]
      .filter(
        ({ definition, campaign, state }) =>
          state.status === 'available' &&
          campaign.status === 'active' &&
          (request.executorType === undefined ||
            definition.supportedExecutorTypes.includes(request.executorType)),
      )
      .map(({ definition, campaign }) =>
        JobOfferSchema.parse(this.offerFor(definition, campaign)),
      );
  }

  public async acquireLease(request: AcquireLeaseRequest): Promise<JobLease> {
    const stored = this.job(request.jobId);
    const acquiredAt = this.instant();
    if (stored.state.lease?.status === 'active')
      throw new CoordinatorError(
        'lease_conflict',
        'Job already has an active lease',
      );
    if (
      stored.state.status !== 'available' ||
      stored.campaign.status !== 'active'
    )
      throw new CoordinatorError('job_unavailable', 'Job is not available');
    if (
      !stored.definition.supportedExecutorTypes.includes(request.executorType)
    )
      throw new CoordinatorError(
        'job_unavailable',
        'Executor type is not supported',
      );
    if (request.durationMs <= 0)
      throw new CoordinatorError(
        'invalid_request',
        'Lease duration must be positive',
      );
    if (stored.state.attemptCount >= stored.state.retryPolicy.maxAttempts)
      throw new CoordinatorError(
        'job_unavailable',
        'Job attempt limit reached',
      );
    const leaseId = LeaseIdSchema.parse(this.id('lease'));
    const runId = RunIdSchema.parse(this.id('run'));
    const expiresAt = new Date(
      this.options.now() + request.durationMs,
    ).toISOString();
    stored.state = JobStateSchema.parse({
      ...stored.state,
      status: 'leased',
      attemptCount: stored.state.attemptCount + 1,
      lease: {
        id: leaseId,
        runId,
        executorId: request.executorId,
        contributorId: request.contributorId,
        status: 'active',
        acquiredAt,
        expiresAt,
      },
      run: { id: runId, status: 'created' },
      approval: undefined,
    });
    stored.leaseNodeId = request.nodeId;
    stored.leaseHeartbeatAt = acquiredAt;
    stored.leaseExecutorType = request.executorType;
    this.leaseToJob.set(leaseId, request.jobId);
    this.runToJob.set(runId, request.jobId);
    return JobLeaseSchema.parse({
      protocolVersion: 1,
      messageType: 'job.lease',
      messageId: MessageIdSchema.parse(this.id('message')),
      id: leaseId,
      jobId: request.jobId,
      runId,
      executorId: request.executorId,
      contributorId: request.contributorId,
      executorType: request.executorType,
      status: 'active',
      leasedAt: acquiredAt,
      expiresAt: stored.state.lease?.expiresAt,
    });
  }

  public async startRun(request: StartRunRequest): Promise<JobRun> {
    const stored = this.jobForLease(request.leaseId);
    this.assertJob(stored, request.jobId);
    this.assertActiveLease(stored, request.leaseId);
    this.assertRun(stored, request.runId);
    if (stored.state.run === undefined) this.missingRun();
    if (stored.state.run.status === 'created')
      stored.state = JobStateSchema.parse({
        ...stored.state,
        status: 'preparing',
        run: { ...stored.state.run, status: 'preparing' },
      });
    const run = stored.state.run;
    if (run === undefined) this.missingRun();
    return {
      id: run.id,
      jobId: stored.state.id,
      leaseId: request.leaseId,
      status: run.status,
      startedAt: this.instant(),
    };
  }

  public async reportProgress(request: ReportProgressRequest): Promise<void> {
    const event = JobProgressEventSchema.parse(request.event);
    const stored = this.jobForLease(request.leaseId);
    this.assertRun(stored, event.runId);
    const serialized = JSON.stringify(event);
    const duplicate = stored.progressBySequence.get(event.sequence);
    if (duplicate !== undefined) {
      if (duplicate === serialized) return;
      throw new CoordinatorError(
        'invalid_run_state',
        `Conflicting progress sequence ${event.sequence}`,
      );
    }
    if (event.sequence < stored.lastProgressSequence) return;
    stored.progressBySequence.set(event.sequence, serialized);
    stored.lastProgressSequence = event.sequence;
    if (event.eventType === 'phase.changed')
      this.applyPhase(stored, event.status);
  }

  public async requestApproval(
    request: CreateApprovalRequest,
  ): Promise<ApprovalRequest> {
    const stored = this.jobForLease(request.leaseId);
    this.assertRun(stored, request.runId);
    const approvalId =
      request.approvalId ?? ApprovalIdSchema.parse(this.id('approval'));
    const requestedAt = this.instant();
    const expiresAt = new Date(
      this.options.now() + request.expiresInMs,
    ).toISOString();
    this.assertActiveLease(stored, request.leaseId);
    if (stored.state.approval !== undefined)
      throw new CoordinatorError(
        'approval_already_resolved',
        'Approval already exists',
      );
    if (
      stored.state.run?.status !== 'preparing' &&
      stored.state.run?.status !== 'running'
    )
      throw new CoordinatorError(
        'invalid_run_state',
        'Run cannot request approval',
      );
    stored.state = JobStateSchema.parse({
      ...stored.state,
      status: 'awaiting_approval',
      run: { ...stored.state.run, status: 'paused_for_approval' },
      approval: {
        id: approvalId,
        status: 'pending',
        reason: request.reason,
        requestedAt,
        expiresAt,
      },
    });
    return ApprovalRequestSchema.parse({
      protocolVersion: 1,
      messageType: 'approval.request',
      messageId: MessageIdSchema.parse(this.id('message')),
      id: approvalId,
      jobId: stored.state.id,
      runId: request.runId,
      approvalType: request.approvalType ?? 'artifact_submission',
      reason: request.reason,
      requestedAt,
      expiresAt,
    });
  }

  public async resolveApproval(request: ResolveApprovalRequest): Promise<void> {
    const stored = this.jobForLease(request.leaseId);
    const decision: ApprovalDecision = request.decision;
    if (stored.state.approval === undefined) {
      throw new CoordinatorError(
        'approval_not_found',
        `Approval ${decision.approvalId} was not found`,
      );
    }
    if (
      stored.state.approval.status !== 'pending' ||
      stored.state.approval.id !== decision.approvalId
    )
      throw new CoordinatorError(
        'approval_already_resolved',
        'Approval is not pending',
      );
    if (decision.decision === 'approved')
      stored.state = JobStateSchema.parse({
        ...stored.state,
        status: 'running',
        run: { ...stored.state.run, status: 'running' },
        approval: {
          ...stored.state.approval,
          status: 'approved',
          resolvedAt: decision.decidedAt,
        },
      });
    else {
      const retryable =
        stored.state.retryPolicy.allowReassignment &&
        stored.state.attemptCount < stored.state.retryPolicy.maxAttempts;
      stored.state = JobStateSchema.parse({
        ...stored.state,
        status: retryable ? 'available' : 'cancelled',
        lease: stored.state.lease
          ? {
              ...stored.state.lease,
              status: 'released',
              endedAt: decision.decidedAt,
            }
          : undefined,
        run: stored.state.run
          ? {
              ...stored.state.run,
              status: 'cancelled',
              cancellationReason: {
                kind: 'user_denied_required_approval',
                approvalId: decision.approvalId,
              },
            }
          : undefined,
        approval: {
          ...stored.state.approval,
          status: 'denied',
          resolvedAt: decision.decidedAt,
          denialReason: decision.reason,
        },
      });
    }
  }

  public async submitArtifact(
    request: SubmitArtifactRequest,
  ): Promise<ArtifactRecord> {
    const stored = this.jobForLease(request.leaseId);
    this.assertRun(stored, request.runId);
    this.assertActiveLease(stored, request.leaseId);
    const artifactId =
      request.artifactId ?? ArtifactIdSchema.parse(this.id('artifact'));
    const record = ArtifactManifestSchema.parse({
      protocolVersion: 1,
      messageType: 'artifact.submission',
      messageId: MessageIdSchema.parse(this.id('message')),
      id: artifactId,
      jobId: stored.state.id,
      runId: request.runId,
      workflowVersionId: stored.definition.workflow.id,
      outputSchemaHash: stored.definition.workflow.outputSchemaHash,
      mediaType: 'application/json',
      contentHash: request.contentHash,
      content: request.content,
      createdAt: this.instant(),
    });
    stored.artifacts.set(record.id, record);
    return record;
  }

  public async getWorkflowDefinition(
    request: GetWorkflowDefinitionRequest,
  ): Promise<ExecutableWorkflowDefinition> {
    const definition = this.workflowDefinitions.get(request.workflowVersionId);
    if (definition === undefined)
      throw new CoordinatorError(
        'job_unavailable',
        `Workflow version ${request.workflowVersionId} has no executable definition`,
      );
    return definition;
  }

  public async completeRun(request: CompleteRunRequest): Promise<void> {
    const stored = this.jobForLease(request.leaseId);
    this.assertRun(stored, request.runId);
    if (!stored.artifacts.has(request.artifactId)) {
      throw new CoordinatorError(
        'artifact_rejected',
        'Completion requires a submitted artifact',
      );
    }
    const validating =
      stored.state.status === 'validating'
        ? stored.state
        : stored.state.status === 'running'
          ? JobStateSchema.parse({ ...stored.state, status: 'validating' })
          : undefined;
    if (validating === undefined)
      throw new CoordinatorError(
        'artifact_rejected',
        'Job cannot be validated',
      );
    if (validating.run === undefined || validating.lease === undefined)
      this.missingRun();
    stored.state = JobStateSchema.parse({
      ...validating,
      run: { ...validating.run, status: 'completed' },
      lease: {
        ...validating.lease,
        status: 'released',
        endedAt: this.instant(),
      },
    });
  }

  public async failRun(request: FailRunRequest): Promise<void> {
    const stored = this.jobForLease(request.leaseId);
    this.assertRun(stored, request.runId);
    const failure: RunFailure = request.failure;
    stored.state = JobStateSchema.parse({
      ...stored.state,
      status: failure.retryable ? 'failed_retryable' : 'failed_final',
      run: { ...stored.state.run, status: 'failed', failure },
      lease: stored.state.lease
        ? { ...stored.state.lease, status: 'released', endedAt: this.instant() }
        : undefined,
    });
    if (
      request.failure.retryable &&
      stored.state.retryPolicy.allowReassignment &&
      stored.state.attemptCount < stored.state.retryPolicy.maxAttempts
    ) {
      stored.state = JobStateSchema.parse({
        ...stored.state,
        status: 'available',
      });
    }
  }

  public async releaseLease(request: ReleaseLeaseRequest): Promise<void> {
    const stored = this.jobForLease(request.leaseId);
    this.assertActiveLease(stored, request.leaseId);
    stored.state = JobStateSchema.parse({
      ...stored.state,
      status: request.retryable === false ? 'cancelled' : 'failed_retryable',
      lease:
        stored.state.lease === undefined
          ? undefined
          : {
              ...stored.state.lease,
              status: 'released',
              endedAt: this.instant(),
            },
      run:
        stored.state.run === undefined
          ? undefined
          : {
              ...stored.state.run,
              status: 'failed',
              failure: {
                kind: 'node_disconnected',
                retryable: true,
                code: 'lease_released',
                message: 'The active lease was released',
              },
            },
    });
    if (request.retryable === false) return;
    stored.state = JobStateSchema.parse({
      ...stored.state,
      status: 'available',
      lease: undefined,
      run: undefined,
      approval: undefined,
    });
  }

  public async renewLease(request: RenewLeaseRequest): Promise<JobLease> {
    const stored = this.jobForLease(request.leaseId);
    this.assertActiveLease(stored, request.leaseId);
    const lease = stored.state.lease;
    if (lease === undefined) this.missingRun();
    const heartbeatAt = this.instant();
    const expiresAt = new Date(
      this.options.now() + request.durationMs,
    ).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(lease.expiresAt)) {
      throw new CoordinatorError(
        'invalid_run_state',
        'Lease renewal must extend the current expiry',
      );
    }
    stored.state = JobStateSchema.parse({
      ...stored.state,
      lease: { ...lease, expiresAt },
    });
    stored.leaseHeartbeatAt = heartbeatAt;
    return JobLeaseSchema.parse({
      protocolVersion: 1,
      messageType: 'job.lease',
      messageId: MessageIdSchema.parse(this.id('message')),
      id: lease.id,
      jobId: stored.state.id,
      runId: lease.runId,
      executorId: lease.executorId,
      contributorId: lease.contributorId,
      executorType: stored.leaseExecutorType ?? 'plugin_host',
      status: lease.status,
      leasedAt: lease.acquiredAt,
      expiresAt,
    });
  }

  public async getJobState(request: GetJobStateRequest): Promise<JobState> {
    return structuredClone(this.job(request.jobId).state);
  }

  public async getRecoverySnapshot(
    request: GetRecoverySnapshotRequest,
  ): Promise<JobRecoverySnapshot> {
    const stored = this.job(request.jobId);
    const lease = stored.state.lease;
    const run = stored.state.run;
    const approval = stored.state.approval;
    return structuredClone({
      job: {
        ...stored.state,
        workflowVersionId: stored.definition.workflow.id,
      },
      leases:
        lease === undefined
          ? []
          : [
              {
                id: lease.id,
                jobId: stored.state.id,
                runId: lease.runId,
                nodeId:
                  stored.leaseNodeId ??
                  NodeIdSchema.parse(
                    `node_${lease.executorId.slice('executor_'.length)}`,
                  ),
                executorId: lease.executorId,
                contributorId: lease.contributorId,
                executorType: stored.leaseExecutorType ?? 'plugin_host',
                status: lease.status,
                acquiredAt: lease.acquiredAt,
                heartbeatAt: stored.leaseHeartbeatAt ?? lease.acquiredAt,
                expiresAt: lease.expiresAt,
                ...(lease.endedAt === undefined
                  ? {}
                  : { releasedAt: lease.endedAt }),
              },
            ],
      runs:
        run === undefined || lease === undefined
          ? []
          : [
              {
                id: run.id,
                jobId: stored.state.id,
                leaseId: lease.id,
                nodeId:
                  stored.leaseNodeId ??
                  NodeIdSchema.parse(
                    `node_${lease.executorId.slice('executor_'.length)}`,
                  ),
                status: run.status,
                progressSequence: stored.lastProgressSequence,
                startedAt: lease.acquiredAt,
                ...(run.failure === undefined
                  ? {}
                  : {
                      failureType: run.failure.retryable
                        ? ('retryable' as const)
                        : ('final' as const),
                      failureCode: run.failure.code,
                      failureMessage: run.failure.message,
                    }),
                ...(stored.state.acceptedArtifactId === undefined
                  ? {}
                  : { acceptedArtifactId: stored.state.acceptedArtifactId }),
              },
            ],
      approvals:
        approval === undefined || lease === undefined || run === undefined
          ? []
          : [
              {
                id: approval.id,
                runId: run.id,
                leaseId: lease.id,
                status: approval.status,
                reason: approval.reason,
                requestedAt: approval.requestedAt,
                expiresAt: approval.expiresAt,
                ...('resolvedAt' in approval
                  ? { resolvedAt: approval.resolvedAt }
                  : {}),
                ...('denialReason' in approval
                  ? { denialReason: approval.denialReason }
                  : {}),
              },
            ],
      artifacts: [...stored.artifacts.values()].map((artifact) => ({
        id: artifact.id,
        jobId: artifact.jobId,
        runId: artifact.runId,
        contentHash: artifact.contentHash,
        status:
          stored.state.acceptedArtifactId === artifact.id
            ? ('accepted' as const)
            : ('submitted' as const),
        createdAt: artifact.createdAt,
      })),
    });
  }

  public async listNodeActiveExecutions(
    request: ListNodeActiveExecutionsRequest,
  ): Promise<readonly JobRecoverySnapshot[]> {
    const active = [...this.jobs.values()]
      .filter(
        ({ state, leaseNodeId }) =>
          state.lease?.status === 'active' && leaseNodeId === request.nodeId,
      )
      .slice(0, request.limit);
    return Promise.all(
      active.map(({ state }) => this.getRecoverySnapshot({ jobId: state.id })),
    );
  }

  private offerFor(definition: JobDefinition, campaign: Campaign) {
    const offeredAt = this.instant();
    return {
      protocolVersion: 1 as const,
      messageType: 'job.offer' as const,
      messageId: MessageIdSchema.parse(this.id('message')),
      id: `offer_${definition.id.slice(4)}`,
      campaign,
      workstream: {
        protocolVersion: 1 as const,
        messageType: 'campaign.workstream' as const,
        id: definition.workstreamId,
        campaignId: campaign.id,
        name: 'Source verification',
        workflow: definition.workflow,
        status: 'active' as const,
        availabilityPolicy: { type: 'manual' as const },
        inventoryPolicy: { type: 'manual_jobs' as const },
        participationPolicy: {},
        completionPolicy: { type: 'all_jobs_completed' as const },
      },
      job: { ...definition, status: 'available' as const },
      offeredAt,
      expiresAt: new Date(this.options.now() + 10 * 60_000).toISOString(),
    };
  }

  private applyPhase(stored: StoredJob, status: JobStatus): void {
    if (
      status === 'running' &&
      stored.state.status === 'preparing' &&
      stored.state.run?.status === 'preparing'
    ) {
      stored.state = JobStateSchema.parse({
        ...stored.state,
        status: 'running',
        run: { ...stored.state.run, status: 'running' },
      });
    } else if (status === 'validating' && stored.state.status === 'running') {
      stored.state = JobStateSchema.parse({
        ...stored.state,
        status: 'validating',
      });
    }
  }

  private job(jobId: JobId): StoredJob {
    const stored = this.jobs.get(jobId);
    if (stored === undefined)
      throw new CoordinatorError('job_not_found', `Job ${jobId} was not found`);
    return stored;
  }

  private jobForLease(leaseId: LeaseId): StoredJob {
    const jobId = this.leaseToJob.get(leaseId);
    if (jobId === undefined)
      throw new CoordinatorError(
        'lease_expired',
        `Lease ${leaseId} was not found`,
      );
    return this.job(jobId);
  }

  private assertJob(stored: StoredJob, jobId: JobId): void {
    if (stored.state.id !== jobId)
      throw new CoordinatorError(
        'job_not_found',
        `Lease does not belong to ${jobId}`,
      );
  }

  private assertRun(stored: StoredJob, runId: RunId): void {
    if (
      stored.state.run?.id !== runId ||
      this.runToJob.get(runId) !== stored.state.id
    )
      this.missingRun();
  }

  private assertActiveLease(stored: StoredJob, leaseId: LeaseId): void {
    if (
      stored.state.lease?.id !== leaseId ||
      stored.state.lease.status !== 'active' ||
      this.options.now() >= Date.parse(stored.state.lease.expiresAt)
    ) {
      throw new CoordinatorError(
        'lease_expired',
        `Lease ${leaseId} is not active`,
      );
    }
  }

  private missingRun(): never {
    throw new CoordinatorError('run_not_found', 'Run was not found');
  }

  private instant(): string {
    return new Date(this.options.now()).toISOString();
  }
  private id(prefix: string): string {
    return `${prefix}_${this.options.createId()}`;
  }
}
