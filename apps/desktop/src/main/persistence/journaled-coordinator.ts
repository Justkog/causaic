import {
  CoordinatorError,
  type JobCoordinator,
} from '@causaic/coordinator-core';
import type { JobId } from '@causaic/protocol';

import type { LocalExecutionId, PendingOperationPayload } from './models.js';
import type { DesktopRepositories } from './repositories.js';

function safeFailure(error: unknown): { code: string; message: string } {
  return error instanceof CoordinatorError
    ? { code: error.code, message: error.message }
    : {
        code: 'coordinator_failure',
        message: 'The coordinator operation failed.',
      };
}

export class JournaledJobCoordinator implements JobCoordinator {
  public constructor(
    private readonly delegate: JobCoordinator,
    private readonly repositories: DesktopRepositories,
    private readonly executionId: LocalExecutionId,
  ) {}

  public listAvailableOpportunities: JobCoordinator['listAvailableOpportunities'] =
    (request) => this.delegate.listAvailableOpportunities(request);

  public async claimOpportunity(
    request: Parameters<JobCoordinator['claimOpportunity']>[0],
  ) {
    const execution = this.repositories.execution(this.executionId);
    if (execution === undefined)
      throw new Error('Local execution is missing');
    if (
      execution.opportunityId !== request.opportunityId ||
      execution.nodeId !== request.nodeId ||
      execution.executorId !== request.executorId
    )
      throw new CoordinatorError(
        'invalid_request',
        'The claim does not match the persisted execution',
      );
    if (execution.jobId !== null) {
      if (
        execution.leaseId !== request.leaseId ||
        execution.runId !== request.runId
      )
        throw new CoordinatorError(
          'invalid_request',
          'A confirmed claim must be retried with the same identities',
        );
      return this.delegate.claimOpportunity(request);
    }
    const existing = this.repositories
      .unconfirmedOperations(this.executionId)
      .find(({ payload }) => payload.kind === 'claim_opportunity');
    if (
      existing?.payload.kind === 'claim_opportunity' &&
      (existing.payload.opportunityId !== request.opportunityId ||
        existing.payload.leaseId !== request.leaseId ||
        existing.payload.runId !== request.runId)
    )
      throw new CoordinatorError(
        'invalid_request',
        'A pending claim must be retried with the same identities',
      );
    this.repositories.updateExecution(this.executionId, {
      lifecycleStatus: 'leasing',
    });
    const operationId = this.repositories.beginOperation(
      this.executionId,
      {
        kind: 'claim_opportunity',
        opportunityId: request.opportunityId,
        leaseId: request.leaseId,
        runId: request.runId,
      },
      `claim:${this.executionId}:${request.opportunityId}`,
    );
    try {
      const result = await this.delegate.claimOpportunity(request);
      this.repositories.confirmClaim(
        operationId,
        this.executionId,
        result.job.id,
        result.lease.id,
        result.lease.runId,
      );
      return result;
    } catch (error) {
      const failure = safeFailure(error);
      this.repositories.failOperation(
        operationId,
        failure.code,
        failure.message,
      );
      throw error;
    }
  }

  public getWorkflowDefinition: JobCoordinator['getWorkflowDefinition'] = (
    request,
  ) => this.delegate.getWorkflowDefinition(request);

  public async startRun(request: Parameters<JobCoordinator['startRun']>[0]) {
    const result = await this.#operation(
      {
        kind: 'start_run',
        jobId: request.jobId,
        leaseId: request.leaseId,
        runId: request.runId,
      },
      `start:${request.runId}`,
      () => this.delegate.startRun(request),
    );
    this.repositories.updateExecution(this.executionId, {
      lifecycleStatus: 'running',
      lastConfirmedRemoteStage: 'run_started',
    });
    return result;
  }

  public async reportProgress(
    request: Parameters<JobCoordinator['reportProgress']>[0],
  ): Promise<void> {
    await this.delegate.reportProgress(request);
    this.repositories.updateExecution(this.executionId, {
      lastProgressSequence: request.event.sequence,
      ...(request.event.eventType === 'progress.reported'
        ? { progressMessage: request.event.message }
        : {}),
      ...(request.event.eventType === 'phase.changed'
        ? {
            lifecycleStatus:
              request.event.status === 'validating'
                ? ('validating' as const)
                : ('running' as const),
          }
        : {}),
    });
  }

  public async requestApproval(
    request: Parameters<JobCoordinator['requestApproval']>[0],
  ) {
    if (request.approvalId === undefined) {
      throw new Error(
        'Durable desktop approvals require a portable approval ID',
      );
    }
    return this.#operation(
      {
        kind: 'request_approval',
        jobId: this.#jobId(),
        leaseId: request.leaseId,
        runId: request.runId,
        approvalId: request.approvalId,
      },
      `approval-request:${request.approvalId}`,
      () => this.delegate.requestApproval(request),
    );
  }

  public async resolveApproval(
    request: Parameters<JobCoordinator['resolveApproval']>[0],
  ): Promise<void> {
    await this.#operation(
      {
        kind: 'resolve_approval',
        jobId: this.#jobId(),
        leaseId: request.leaseId,
        approvalId: request.decision.approvalId,
        decision: request.decision.decision,
        ...(request.decision.decision === 'denied'
          ? { reason: request.decision.reason }
          : {}),
      },
      `approval-resolve:${request.decision.approvalId}:${request.decision.decision}`,
      () => this.delegate.resolveApproval(request),
    );
    this.repositories.reconcileApproval(
      request.decision.approvalId,
      request.decision.decision,
      Date.parse(request.decision.decidedAt),
    );
  }

  public async submitArtifact(
    request: Parameters<JobCoordinator['submitArtifact']>[0],
  ) {
    if (request.artifactId === undefined) {
      throw new Error(
        'Durable desktop artifacts require a portable artifact ID',
      );
    }
    this.repositories.markArtifactSubmission(request.artifactId, 'pending');
    const result = await this.#operation(
      {
        kind: 'submit_artifact',
        jobId: request.jobId,
        leaseId: request.leaseId,
        runId: request.runId,
        artifactId: request.artifactId,
        contentHash: request.contentHash,
      },
      `artifact-submit:${request.artifactId}`,
      () => this.delegate.submitArtifact(request),
    );
    this.repositories.markArtifactSubmission(result.id, 'confirmed');
    this.repositories.updateExecution(this.executionId, {
      lifecycleStatus: 'artifact_submitted',
      lastConfirmedRemoteStage: 'artifact_submitted',
    });
    return result;
  }

  public async completeRun(
    request: Parameters<JobCoordinator['completeRun']>[0],
  ): Promise<void> {
    this.repositories.updateExecution(this.executionId, {
      lifecycleStatus: 'completion_pending',
    });
    await this.#operation(
      {
        kind: 'complete_run',
        jobId: request.jobId,
        leaseId: request.leaseId,
        runId: request.runId,
        artifactId: request.artifactId,
      },
      `complete:${request.runId}:${request.artifactId}`,
      () => this.delegate.completeRun(request),
    );
    this.repositories.updateExecution(this.executionId, {
      lastConfirmedRemoteStage: 'run_completed',
    });
  }

  public async failRun(
    request: Parameters<JobCoordinator['failRun']>[0],
  ): Promise<void> {
    this.repositories.updateExecution(this.executionId, {
      lifecycleStatus: 'cleanup_pending',
    });
    await this.#operation(
      {
        kind: 'fail_run',
        jobId: this.#jobId(),
        leaseId: request.leaseId,
        runId: request.runId,
        retryable: request.failure.retryable,
        code: request.failure.code,
        message: request.failure.message,
      },
      `fail:${request.runId}:${request.failure.code}`,
      () => this.delegate.failRun(request),
    );
  }

  public async releaseLease(
    request: Parameters<JobCoordinator['releaseLease']>[0],
  ): Promise<void> {
    this.repositories.updateExecution(this.executionId, {
      lifecycleStatus: 'cleanup_pending',
    });
    await this.#operation(
      {
        kind: 'release_lease',
        jobId: this.#jobId(),
        leaseId: request.leaseId,
      },
      `release:${request.leaseId}`,
      () => this.delegate.releaseLease(request),
    );
  }

  public async renewLease(
    request: Parameters<JobCoordinator['renewLease']>[0],
  ) {
    return this.#operation(
      {
        kind: 'renew_lease',
        jobId: this.#jobId(),
        leaseId: request.leaseId,
        durationMs: request.durationMs,
      },
      `renew:${request.leaseId}:${Math.floor(Date.now() / request.durationMs)}`,
      () => this.delegate.renewLease(request),
    );
  }

  public getJobState: JobCoordinator['getJobState'] = (request) =>
    this.delegate.getJobState(request);

  public getRecoverySnapshot: JobCoordinator['getRecoverySnapshot'] = (
    request,
  ) => this.delegate.getRecoverySnapshot(request);

  public listNodeActiveExecutions: JobCoordinator['listNodeActiveExecutions'] =
    (request) => this.delegate.listNodeActiveExecutions(request);

  async #operation<Result>(
    payload: PendingOperationPayload,
    idempotencyKey: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const id = this.repositories.beginOperation(
      this.executionId,
      payload,
      idempotencyKey,
    );
    try {
      const result = await operation();
      this.repositories.confirmOperation(id);
      return result;
    } catch (error) {
      const failure = safeFailure(error);
      this.repositories.failOperation(id, failure.code, failure.message);
      throw error;
    }
  }

  #jobId(): JobId {
    const execution = this.repositories.execution(this.executionId);
    if (execution === undefined) throw new Error('Local execution is missing');
    if (execution.jobId === null)
      throw new Error('The concrete job has not been bound to this execution');
    return execution.jobId;
  }
}
