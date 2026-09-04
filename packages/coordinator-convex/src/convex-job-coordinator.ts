import { randomUUID } from 'node:crypto';

import type { JobCoordinator, JobRun } from '@causaic/coordinator-core';
import {
  CoordinatorError,
  CoordinatorProtocolMismatchError,
} from '@causaic/coordinator-core';
import {
  ApprovalDecisionSchema,
  ApprovalIdSchema,
  ApprovalRequestSchema,
  ArtifactIdSchema,
  ArtifactManifestSchema,
  CampaignIdSchema,
  ClaimedContributionSchema,
  CauseIdSchema,
  ContributionOpportunitySummarySchema,
  ExecutorIdSchema,
  ExecutableWorkflowDefinitionSchema,
  JobIdSchema,
  JobLeaseSchema,
  JobProgressEventSchema,
  JobStateSchema,
  LeaseIdSchema,
  NodeIdSchema,
  RunIdSchema,
  UserIdSchema,
  WorkflowVersionIdSchema,
} from '@causaic/protocol';
import type {
  ExecutorType,
  ClaimedContribution,
  ContributionOpportunitySummary,
  JobDefinition,
  JobLease,
  LeaseId,
} from '@causaic/protocol';
import { makeFunctionReference } from 'convex/server';
import { z } from 'zod';

import type { ConvexCoordinatorClient } from './client.js';
import { createConvexCoordinatorClient } from './client.js';
import type { ConvexCoordinatorConfig } from './config.js';
import { ConvexCoordinatorConfigSchema } from './config.js';
import { mapConvexCoordinatorError } from './error-mapping.js';

const opportunitySummariesSchema = z.array(
  ContributionOpportunitySummarySchema,
);
const opportunityPageSchema = z.object({
  page: z.array(ContributionOpportunitySummarySchema),
  isDone: z.boolean(),
  continueCursor: z.string(),
});
const publicRunSchema = z
  .object({
    id: RunIdSchema,
    jobId: JobIdSchema,
    leaseId: LeaseIdSchema,
    nodeId: NodeIdSchema,
    status: z.enum([
      'created',
      'preparing',
      'starting_runtime',
      'running',
      'paused_for_approval',
      'paused_for_capacity',
      'checkpointing',
      'cancelling',
      'cancelled',
      'failed',
      'completed',
    ]),
    startedAt: z.iso.datetime(),
    progressSequence: z.number().int(),
    currentPhase: z.string().optional(),
    progressMessage: z.string().optional(),
    completedAt: z.iso.datetime().optional(),
    failureType: z
      .enum(['retryable', 'final', 'cancelled', 'provider_capacity_exhausted'])
      .optional(),
    failureCode: z.string().optional(),
    failureMessage: z.string().optional(),
    acceptedArtifactId: ArtifactIdSchema.optional(),
  })
  .passthrough();
const approvalRecordSchema = z.object({
  id: ApprovalIdSchema,
  runId: RunIdSchema,
  leaseId: LeaseIdSchema,
  status: z.enum(['pending', 'approved', 'denied']),
  reason: z.string(),
  requestedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  denialReason: z.string().optional(),
});
const recoveryLeaseSchema = z.object({
  id: LeaseIdSchema,
  jobId: JobIdSchema,
  runId: RunIdSchema,
  nodeId: NodeIdSchema,
  executorId: ExecutorIdSchema,
  contributorId: UserIdSchema,
  executorType: z.enum(['plugin_host', 'desktop_node']),
  status: z.enum(['active', 'released', 'expired']),
  acquiredAt: z.iso.datetime(),
  heartbeatAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  releasedAt: z.iso.datetime().optional(),
});
const aggregateSchema = z.object({
  job: z.object({
    id: JobIdSchema,
    workflowVersionId: WorkflowVersionIdSchema,
    campaignId: CampaignIdSchema,
    causeId: CauseIdSchema,
    status: z.enum([
      'available',
      'leased',
      'preparing',
      'running',
      'awaiting_approval',
      'validating',
      'completed',
      'failed_retryable',
      'failed_final',
      'cancelled',
    ]),
    attemptCount: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
  }),
  leases: z.array(recoveryLeaseSchema),
  runs: z.array(publicRunSchema),
  approvals: z.array(approvalRecordSchema),
  artifacts: z.array(
    z
      .object({
        id: ArtifactIdSchema,
        jobId: JobIdSchema,
        runId: RunIdSchema,
        contentHash: ArtifactManifestSchema.shape.contentHash,
        status: z.enum([
          'submitted',
          'validating',
          'awaiting_review',
          'accepted',
          'rejected',
        ]),
        createdAt: z.iso.datetime(),
      })
      .passthrough(),
  ),
});

type ListAvailableArgs = {
  executorType?: ExecutorType;
  paginationOpts: { numItems: number; cursor: string | null };
};
type SecretArgs = { developmentSecret: string };
type ClaimArgs = SecretArgs & {
  opportunityExternalId: string;
  leaseExternalId: string;
  nodeExternalId: string;
  runExternalId: string;
  executorExternalId: string;
  contributorExternalId: string;
  executorType: ExecutorType;
  now: number;
  durationMs: number;
};

const functions = {
  listAvailable: makeFunctionReference<'query', ListAvailableArgs, unknown>(
    'contributorOpportunities:listAvailable',
  ),
  inspectAggregate: makeFunctionReference<
    'query',
    SecretArgs & { jobExternalId: string },
    unknown
  >('jobs:inspectAggregate'),
  listNodeActiveExecutions: makeFunctionReference<
    'query',
    SecretArgs & { nodeExternalId: string; limit: number },
    unknown
  >('jobs:listNodeActiveExecutions'),
  claim: makeFunctionReference<'mutation', ClaimArgs, unknown>(
    'contributorOpportunities:claim',
  ),
  release: makeFunctionReference<
    'mutation',
    SecretArgs & {
      leaseExternalId: string;
      nodeExternalId: string;
      now: number;
    },
    unknown
  >('leases:release'),
  renew: makeFunctionReference<
    'mutation',
    SecretArgs & {
      leaseExternalId: string;
      nodeExternalId: string;
      now: number;
      durationMs: number;
    },
    unknown
  >('leases:renew'),
  start: makeFunctionReference<
    'mutation',
    SecretArgs & {
      runExternalId: string;
      jobExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      runtimeType: string;
      startedAt: number;
    },
    unknown
  >('runs:start'),
  progress: makeFunctionReference<
    'mutation',
    SecretArgs & {
      runExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      sequence: number;
      phase: string;
      message?: string;
      runStatus?: string;
      jobStatus?: string;
    },
    unknown
  >('runs:reportProgress'),
  approvalRequest: makeFunctionReference<
    'mutation',
    SecretArgs & {
      approvalExternalId: string;
      runExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      approvalType: 'artifact_submission' | 'network_access';
      reason: string;
      requestedCapabilities: ['artifact_submission' | 'network_access'];
      requestedAt: number;
      expiresAt: number;
    },
    unknown
  >('approvals:request'),
  approvalResolve: makeFunctionReference<
    'mutation',
    SecretArgs & {
      approvalExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      decision: 'approved' | 'denied';
      reason?: string;
      resolvedAt: number;
    },
    unknown
  >('approvals:resolve'),
  artifactSubmit: makeFunctionReference<
    'mutation',
    SecretArgs & {
      artifactExternalId: string;
      jobExternalId: string;
      runExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      artifact: unknown;
      contentHash: string;
      createdAt: number;
    },
    unknown
  >('artifacts:submit'),
  workflowDefinition: makeFunctionReference<
    'query',
    SecretArgs & { jobExternalId: string; workflowVersionExternalId: string },
    unknown
  >('workflows:getExecutionDefinition'),
  complete: makeFunctionReference<
    'mutation',
    SecretArgs & {
      runExternalId: string;
      jobExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      artifactExternalId: string;
      completedAt: number;
    },
    unknown
  >('runs:complete'),
  fail: makeFunctionReference<
    'mutation',
    SecretArgs & {
      runExternalId: string;
      leaseExternalId: string;
      nodeExternalId: string;
      failureType: 'retryable' | 'final' | 'provider_capacity_exhausted';
      code: string;
      message: string;
      failedAt: number;
    },
    unknown
  >('runs:fail'),
};

interface LeaseContext {
  readonly lease: JobLease;
  readonly job: JobDefinition;
  lastExternalSequence: number;
  lastProgressFingerprint?: string;
  readonly progressBySequence: Map<number, string>;
}

export interface ConvexJobCoordinatorDependencies {
  readonly now?: () => number;
  readonly createId?: (prefix: string) => string;
}

function progressFingerprint(
  event: z.infer<typeof JobProgressEventSchema>,
): string {
  switch (event.eventType) {
    case 'phase.changed':
      return `${event.eventType}:${event.status}`;
    case 'progress.reported':
      return `${event.eventType}:${event.message}:${event.percentage ?? ''}`;
    case 'approval.requested':
      return `${event.eventType}:${event.approvalId}`;
    case 'artifact.submitted':
    case 'run.completed':
      return `${event.eventType}:${event.artifactId}`;
    case 'run.failed':
      return `${event.eventType}:${event.failure.retryable}:${event.failure.code}:${event.failure.message}`;
  }
}

function parseBoundary<Output>(
  schema: z.ZodType<Output>,
  value: unknown,
): Output {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CoordinatorProtocolMismatchError(
      `Convex returned data that does not satisfy the coordinator protocol: ${z.prettifyError(result.error)}`,
      { cause: result.error },
    );
  }
  return result.data;
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function failureKind(
  code: string,
  failureType:
    | 'retryable'
    | 'final'
    | 'cancelled'
    | 'provider_capacity_exhausted'
    | undefined,
) {
  if (failureType === 'provider_capacity_exhausted')
    return 'provider_limit_reached' as const;
  if (code === 'artifact_invalid' || code === 'artifact_mismatch')
    return 'invalid_workflow_output' as const;
  if (code === 'artifact_upload_failed')
    return 'artifact_upload_failed' as const;
  if (code === 'temporary_network_failure')
    return 'temporary_network_failure' as const;
  if (code === 'node_disconnected' || code === 'lease_expired')
    return 'node_disconnected' as const;
  return 'runtime_crashed' as const;
}

function newestByTimestamp<Value>(
  values: readonly Value[],
  timestamp: (value: Value) => string,
): Value | undefined {
  return values.reduce<Value | undefined>((newest, value) => {
    if (newest === undefined) return value;
    return Date.parse(timestamp(value)) > Date.parse(timestamp(newest))
      ? value
      : newest;
  }, undefined);
}

type Aggregate = z.infer<typeof aggregateSchema>;
type CoordinatorJobState = Awaited<ReturnType<JobCoordinator['getJobState']>>;

function jobStateFromAggregate(aggregate: Aggregate): CoordinatorJobState {
  const lease =
    newestByTimestamp(
      aggregate.leases.filter(({ status }) => status === 'active'),
      ({ acquiredAt }) => acquiredAt,
    ) ?? newestByTimestamp(aggregate.leases, ({ acquiredAt }) => acquiredAt);
  const run =
    (lease === undefined
      ? undefined
      : aggregate.runs.find(({ leaseId }) => leaseId === lease.id)) ??
    newestByTimestamp(aggregate.runs, ({ startedAt }) => startedAt);
  const approval =
    (run === undefined
      ? undefined
      : newestByTimestamp(
          aggregate.approvals.filter(({ runId }) => runId === run.id),
          ({ requestedAt }) => requestedAt,
        )) ??
    newestByTimestamp(aggregate.approvals, ({ requestedAt }) => requestedAt);
  return JobStateSchema.parse({
    id: aggregate.job.id,
    campaignId: aggregate.job.campaignId,
    causeId: aggregate.job.causeId,
    status: aggregate.job.status,
    attemptCount: aggregate.job.attemptCount,
    retryPolicy: {
      allowReassignment: true,
      maxAttempts: aggregate.job.maxAttempts,
    },
    ...(lease === undefined
      ? {}
      : {
          lease: {
            id: lease.id,
            runId: lease.runId,
            executorId: lease.executorId,
            contributorId: lease.contributorId,
            status: lease.status,
            acquiredAt: lease.acquiredAt,
            expiresAt: lease.expiresAt,
            ...(lease.releasedAt === undefined
              ? {}
              : { endedAt: lease.releasedAt }),
          },
        }),
    ...(run === undefined
      ? {}
      : {
          run: {
            id: run.id,
            status: run.status,
            ...(run.failureCode === undefined
              ? {}
              : {
                  failure: {
                    kind: failureKind(run.failureCode, run.failureType),
                    retryable:
                      run.failureType !== 'final' &&
                      run.failureType !== 'cancelled',
                    code: run.failureCode,
                    message: run.failureMessage ?? run.failureCode,
                  },
                }),
          },
        }),
    ...(approval === undefined
      ? {}
      : {
          approval:
            approval.status === 'pending'
              ? {
                  id: approval.id,
                  status: approval.status,
                  reason: approval.reason,
                  requestedAt: approval.requestedAt,
                  expiresAt: approval.expiresAt,
                }
              : approval.status === 'approved'
                ? {
                    id: approval.id,
                    status: approval.status,
                    reason: approval.reason,
                    requestedAt: approval.requestedAt,
                    expiresAt: approval.expiresAt,
                    resolvedAt: approval.resolvedAt ?? approval.requestedAt,
                  }
                : {
                    id: approval.id,
                    status: approval.status,
                    reason: approval.reason,
                    requestedAt: approval.requestedAt,
                    expiresAt: approval.expiresAt,
                    resolvedAt: approval.resolvedAt ?? approval.requestedAt,
                    denialReason:
                      approval.denialReason ?? 'Approval was denied',
                  },
        }),
    ...(run?.acceptedArtifactId === undefined
      ? {}
      : { acceptedArtifactId: run.acceptedArtifactId }),
  });
}

export class ConvexJobCoordinator implements JobCoordinator {
  readonly #config: ConvexCoordinatorConfig;
  readonly #client: ConvexCoordinatorClient;
  readonly #now: () => number;
  readonly #createId: (prefix: string) => string;
  readonly #leases = new Map<string, LeaseContext>();

  public constructor(
    config: ConvexCoordinatorConfig,
    client: ConvexCoordinatorClient = createConvexCoordinatorClient(
      config.convexUrl,
    ),
    dependencies: ConvexJobCoordinatorDependencies = {},
  ) {
    this.#config = ConvexCoordinatorConfigSchema.parse(config);
    this.#client = client;
    this.#now = dependencies.now ?? Date.now;
    this.#createId = dependencies.createId ?? id;
  }

  async #call<Output>(
    operation: () => Promise<unknown>,
    schema: z.ZodType<Output>,
  ) {
    try {
      return parseBoundary(schema, await operation());
    } catch (error) {
      throw mapConvexCoordinatorError(error);
    }
  }

  #context(leaseId: LeaseId): LeaseContext {
    const context = this.#leases.get(leaseId);
    if (context === undefined) {
      throw mapConvexCoordinatorError({
        data: { code: 'LEASE_NOT_FOUND', leaseId },
      });
    }
    return context;
  }

  public async listAvailableOpportunities(
    request: Parameters<JobCoordinator['listAvailableOpportunities']>[0],
  ): Promise<readonly ContributionOpportunitySummary[]> {
    const opportunities: ContributionOpportunitySummary[] = [];
    let cursor: string | null = null;
    for (;;) {
      const result = await this.#call(
        () =>
          this.#client.query(functions.listAvailable, {
            ...(request.executorType === undefined
              ? {}
              : { executorType: request.executorType }),
            paginationOpts: { numItems: 50, cursor },
          }),
        opportunityPageSchema,
      );
      opportunities.push(...result.page);
      if (result.isDone) break;
      if (result.continueCursor === cursor)
        throw new CoordinatorProtocolMismatchError(
          'Convex returned a non-advancing opportunity pagination cursor',
        );
      cursor = result.continueCursor;
    }
    return opportunitySummariesSchema.parse(opportunities);
  }

  public async claimOpportunity(
    request: Parameters<JobCoordinator['claimOpportunity']>[0],
  ): Promise<ClaimedContribution> {
    if (request.nodeId !== this.#config.nodeExternalId) {
      throw new CoordinatorError(
        'lease_node_mismatch',
        'Claim node does not match the configured coordinator node',
      );
    }
    const now = this.#now();
    const claimed = await this.#call(
      () =>
        this.#client.mutation(functions.claim, {
          opportunityExternalId: request.opportunityId,
          leaseExternalId: request.leaseId,
          runExternalId: request.runId,
          nodeExternalId: request.nodeId,
          executorExternalId: request.executorId,
          contributorExternalId: request.contributorId,
          executorType: request.executorType,
          now,
          durationMs: request.durationMs,
          developmentSecret: this.#config.developmentSecret,
        }),
      ClaimedContributionSchema,
    );
    if (
      claimed.opportunityId !== request.opportunityId ||
      claimed.lease.id !== request.leaseId ||
      claimed.lease.runId !== request.runId ||
      claimed.lease.executorId !== request.executorId ||
      claimed.lease.contributorId !== request.contributorId ||
      claimed.lease.executorType !== request.executorType
    ) {
      throw new CoordinatorProtocolMismatchError(
        'Convex returned a claim that does not match the request identities',
      );
    }
    this.#leases.set(claimed.lease.id, {
      lease: claimed.lease,
      job: claimed.job,
      lastExternalSequence: -1,
      progressBySequence: new Map(),
    });
    return claimed;
  }

  public async startRun(
    request: Parameters<JobCoordinator['startRun']>[0],
  ): Promise<JobRun> {
    const startedAt = this.#now();
    const run = await this.#call(
      () =>
        this.#client.mutation(functions.start, {
          runExternalId: request.runId,
          jobExternalId: request.jobId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          runtimeType: 'fake',
          startedAt,
          developmentSecret: this.#config.developmentSecret,
        }),
      publicRunSchema,
    );
    await this.#call(
      () =>
        this.#client.mutation(functions.progress, {
          runExternalId: run.id,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          sequence: 1,
          phase: 'starting_runtime',
          runStatus: 'starting_runtime',
          jobStatus: 'preparing',
          developmentSecret: this.#config.developmentSecret,
        }),
      publicRunSchema,
    );
    return {
      id: run.id,
      jobId: run.jobId,
      leaseId: run.leaseId,
      status: run.status,
      startedAt: run.startedAt,
    };
  }

  public async reportProgress(
    request: Parameters<JobCoordinator['reportProgress']>[0],
  ): Promise<void> {
    const context = this.#context(request.leaseId);
    const event = JobProgressEventSchema.parse(request.event);
    const serialized = JSON.stringify(event);
    const duplicate = context.progressBySequence.get(event.sequence);
    if (duplicate === serialized) return;
    if (event.sequence < context.lastExternalSequence) return;
    const fingerprint = progressFingerprint(event);
    if (
      event.sequence > context.lastExternalSequence &&
      context.lastProgressFingerprint === fingerprint
    ) {
      context.progressBySequence.set(event.sequence, serialized);
      context.lastExternalSequence = event.sequence;
      return;
    }
    const status =
      event.eventType === 'phase.changed' ? event.status : undefined;
    const runStatus =
      status === 'running'
        ? 'running'
        : status === 'preparing'
          ? 'preparing'
          : undefined;
    await this.#call(
      () =>
        this.#client.mutation(functions.progress, {
          runExternalId: context.lease.runId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          sequence: event.sequence + 2,
          phase: status ?? event.eventType,
          ...(event.eventType === 'progress.reported'
            ? { message: event.message }
            : {}),
          ...(runStatus === undefined ? {} : { runStatus }),
          ...(status === undefined ? {} : { jobStatus: status }),
          developmentSecret: this.#config.developmentSecret,
        }),
      publicRunSchema,
    );
    context.lastExternalSequence = Math.max(
      context.lastExternalSequence,
      event.sequence,
    );
    context.progressBySequence.set(event.sequence, serialized);
    context.lastProgressFingerprint = fingerprint;
  }

  public async requestApproval(
    request: Parameters<JobCoordinator['requestApproval']>[0],
  ) {
    this.#context(request.leaseId);
    const requestedAt = this.#now();
    return this.#call(
      () =>
        this.#client.mutation(functions.approvalRequest, {
          approvalExternalId: request.approvalId ?? this.#createId('approval'),
          runExternalId: request.runId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          approvalType: request.approvalType ?? 'artifact_submission',
          reason: request.reason,
          requestedCapabilities: [
            request.approvalType ?? 'artifact_submission',
          ],
          requestedAt,
          expiresAt: requestedAt + request.expiresInMs,
          developmentSecret: this.#config.developmentSecret,
        }),
      ApprovalRequestSchema,
    );
  }

  public async resolveApproval(
    request: Parameters<JobCoordinator['resolveApproval']>[0],
  ): Promise<void> {
    const decision = ApprovalDecisionSchema.parse(request.decision);
    await this.#call(
      () =>
        this.#client.mutation(functions.approvalResolve, {
          approvalExternalId: decision.approvalId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          decision: decision.decision,
          ...(decision.decision === 'denied'
            ? { reason: decision.reason }
            : {}),
          resolvedAt: Date.parse(decision.decidedAt),
          developmentSecret: this.#config.developmentSecret,
        }),
      ApprovalDecisionSchema,
    );
  }

  public async submitArtifact(
    request: Parameters<JobCoordinator['submitArtifact']>[0],
  ) {
    return this.#call(
      () =>
        this.#client.mutation(functions.artifactSubmit, {
          artifactExternalId: request.artifactId ?? this.#createId('artifact'),
          jobExternalId: request.jobId,
          runExternalId: request.runId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          artifact: request.content,
          contentHash: request.contentHash,
          createdAt: this.#now(),
          developmentSecret: this.#config.developmentSecret,
        }),
      ArtifactManifestSchema,
    );
  }

  public async getWorkflowDefinition(
    request: Parameters<JobCoordinator['getWorkflowDefinition']>[0],
  ) {
    return this.#call(
      () =>
        this.#client.query(functions.workflowDefinition, {
          jobExternalId: request.jobId,
          workflowVersionExternalId: request.workflowVersionId,
          developmentSecret: this.#config.developmentSecret,
        }),
      ExecutableWorkflowDefinitionSchema,
    );
  }

  public async completeRun(
    request: Parameters<JobCoordinator['completeRun']>[0],
  ): Promise<void> {
    await this.#call(
      () =>
        this.#client.mutation(functions.complete, {
          runExternalId: request.runId,
          jobExternalId: request.jobId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          artifactExternalId: request.artifactId,
          completedAt: this.#now(),
          developmentSecret: this.#config.developmentSecret,
        }),
      publicRunSchema,
    );
  }

  public async failRun(
    request: Parameters<JobCoordinator['failRun']>[0],
  ): Promise<void> {
    await this.#call(
      () =>
        this.#client.mutation(functions.fail, {
          runExternalId: request.runId,
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          failureType:
            request.failure.kind === 'provider_limit_reached'
              ? 'provider_capacity_exhausted'
              : request.failure.retryable
                ? 'retryable'
                : 'final',
          code: request.failure.code,
          message: request.failure.message,
          failedAt: this.#now(),
          developmentSecret: this.#config.developmentSecret,
        }),
      publicRunSchema,
    );
  }

  public async releaseLease(
    request: Parameters<JobCoordinator['releaseLease']>[0],
  ): Promise<void> {
    await this.#call(
      () =>
        this.#client.mutation(functions.release, {
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          now: this.#now(),
          developmentSecret: this.#config.developmentSecret,
        }),
      JobLeaseSchema,
    );
  }

  public async renewLease(
    request: Parameters<JobCoordinator['renewLease']>[0],
  ): Promise<JobLease> {
    const lease = await this.#call(
      () =>
        this.#client.mutation(functions.renew, {
          leaseExternalId: request.leaseId,
          nodeExternalId: this.#config.nodeExternalId,
          now: this.#now(),
          durationMs: request.durationMs,
          developmentSecret: this.#config.developmentSecret,
        }),
      JobLeaseSchema,
    );
    const context = this.#leases.get(request.leaseId);
    if (context !== undefined) {
      this.#leases.set(request.leaseId, { ...context, lease });
    }
    return lease;
  }

  public async getJobState(
    request: Parameters<JobCoordinator['getJobState']>[0],
  ): ReturnType<JobCoordinator['getJobState']> {
    return jobStateFromAggregate(await this.#loadAggregate(request.jobId));
  }

  public async getRecoverySnapshot(
    request: Parameters<JobCoordinator['getRecoverySnapshot']>[0],
  ): ReturnType<JobCoordinator['getRecoverySnapshot']> {
    const aggregate = await this.#loadAggregate(request.jobId);
    return {
      job: {
        ...jobStateFromAggregate(aggregate),
        workflowVersionId: aggregate.job.workflowVersionId,
      },
      leases: aggregate.leases.map((lease) => ({
        id: lease.id,
        jobId: lease.jobId,
        runId: lease.runId,
        nodeId: lease.nodeId,
        executorId: lease.executorId,
        contributorId: lease.contributorId,
        executorType: lease.executorType,
        status: lease.status,
        acquiredAt: lease.acquiredAt,
        heartbeatAt: lease.heartbeatAt,
        expiresAt: lease.expiresAt,
        ...(lease.releasedAt === undefined
          ? {}
          : { releasedAt: lease.releasedAt }),
      })),
      runs: aggregate.runs.map((run) => ({
        id: run.id,
        jobId: run.jobId,
        leaseId: run.leaseId,
        nodeId: NodeIdSchema.parse(run.nodeId),
        status: run.status,
        progressSequence: run.progressSequence,
        startedAt: run.startedAt,
        ...(run.currentPhase === undefined
          ? {}
          : { currentPhase: run.currentPhase }),
        ...(run.progressMessage === undefined
          ? {}
          : { progressMessage: run.progressMessage }),
        ...(run.completedAt === undefined
          ? {}
          : { completedAt: run.completedAt }),
        ...(run.failureType === undefined
          ? {}
          : { failureType: run.failureType }),
        ...(run.failureCode === undefined
          ? {}
          : { failureCode: run.failureCode }),
        ...(run.failureMessage === undefined
          ? {}
          : { failureMessage: run.failureMessage }),
        ...(run.acceptedArtifactId === undefined
          ? {}
          : { acceptedArtifactId: run.acceptedArtifactId }),
      })),
      approvals: aggregate.approvals.map((approval) => ({
        id: approval.id,
        runId: approval.runId,
        leaseId: approval.leaseId,
        status: approval.status,
        reason: approval.reason,
        requestedAt: approval.requestedAt,
        expiresAt: approval.expiresAt,
        ...(approval.resolvedAt === undefined
          ? {}
          : { resolvedAt: approval.resolvedAt }),
        ...(approval.denialReason === undefined
          ? {}
          : { denialReason: approval.denialReason }),
      })),
      artifacts: aggregate.artifacts.map((artifact) => ({
        id: artifact.id,
        jobId: artifact.jobId,
        runId: artifact.runId,
        contentHash: artifact.contentHash,
        status: artifact.status,
        createdAt: artifact.createdAt,
      })),
    };
  }

  public async listNodeActiveExecutions(
    request: Parameters<JobCoordinator['listNodeActiveExecutions']>[0],
  ): ReturnType<JobCoordinator['listNodeActiveExecutions']> {
    if (request.nodeId !== this.#config.nodeExternalId) {
      throw mapConvexCoordinatorError({
        data: { code: 'LEASE_NODE_MISMATCH' },
      });
    }
    const aggregates = await this.#call(
      () =>
        this.#client.query(functions.listNodeActiveExecutions, {
          nodeExternalId: request.nodeId,
          limit: request.limit,
          developmentSecret: this.#config.developmentSecret,
        }),
      z.array(aggregateSchema),
    );
    return Promise.all(
      aggregates.map(({ job }) => this.getRecoverySnapshot({ jobId: job.id })),
    );
  }

  async #loadAggregate(jobId: string): Promise<Aggregate> {
    return this.#call(
      () =>
        this.#client.query(functions.inspectAggregate, {
          jobExternalId: jobId,
          developmentSecret: this.#config.developmentSecret,
        }),
      aggregateSchema,
    );
  }
}
