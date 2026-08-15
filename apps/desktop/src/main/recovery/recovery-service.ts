import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  JobCoordinator,
  JobRecoverySnapshot,
} from '@causaic/coordinator-core';
import type { ExecutorId, NodeId } from '@causaic/protocol';
import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  LeaseIdSchema,
  MessageIdSchema,
  RunIdSchema,
} from '@causaic/protocol';
import { WorkflowArtifactValidator } from '@causaic/runner-core';

import type { DesktopStateStore } from '../state.js';
import { JournaledJobCoordinator } from '../persistence/journaled-coordinator.js';
import type { PersistedExecution } from '../persistence/models.js';
import type { DesktopRepositories } from '../persistence/repositories.js';
import { classifyRecovery } from './classifier.js';

export interface RecoverySummary {
  readonly recoveredExecutions: number;
  readonly issues: readonly string[];
}

export interface DesktopRecoveryServiceOptions {
  readonly coordinator: JobCoordinator;
  readonly repositories: DesktopRepositories;
  readonly state: DesktopStateStore;
  readonly nodeId: NodeId;
  readonly executorId: ExecutorId;
  readonly artifactRoot: string;
  readonly now?: () => number;
}

export class DesktopRecoveryService {
  readonly #options: DesktopRecoveryServiceOptions;

  public constructor(options: DesktopRecoveryServiceOptions) {
    this.#options = options;
  }

  public async recoverOnStartup(): Promise<RecoverySummary> {
    this.#options.state.update((state) => ({
      ...state,
      recovery: { status: 'recovering' },
    }));
    const local = [...this.#options.repositories.incompleteExecutions()];
    const remoteOwned =
      await this.#options.coordinator.listNodeActiveExecutions({
        nodeId: this.#options.nodeId,
        limit: 10,
      });
    const localJobs = new Set(local.map(({ jobId }) => jobId));
    for (const remote of remoteOwned) {
      if (localJobs.has(remote.job.id)) continue;
      const lease = remote.leases.find(({ status }) => status === 'active');
      if (lease === undefined) continue;
      const recovered = this.#options.repositories.createExecution({
        jobId: remote.job.id,
        nodeId: this.#options.nodeId,
        executorId: this.#options.executorId,
        runtimeType: 'fake',
        objective: 'Recovered interrupted contribution',
        campaignName: 'Recovered campaign',
        startedAt: Date.parse(lease.acquiredAt),
      });
      this.#options.repositories.bindLease(recovered.id, lease.id, lease.runId);
      local.push(this.#options.repositories.execution(recovered.id)!);
    }

    const issues: string[] = [];
    let recoveredExecutions = 0;
    for (const execution of local) {
      try {
        const outcome = await this.reconcileExecution(execution);
        if (outcome !== undefined) issues.push(outcome);
        else recoveredExecutions += 1;
      } catch {
        issues.push(
          `Recovery for ${execution.jobId} is waiting for the coordinator.`,
        );
      }
    }
    this.#options.state.update((state) => ({
      ...state,
      recovery:
        issues.length === 0
          ? { status: 'recovered', recoveredExecutions }
          : { status: 'attention_required', issues: issues.slice(0, 20) },
    }));
    return { recoveredExecutions, issues };
  }

  public async endInterruptedExecution(): Promise<void> {
    const execution = this.#options.repositories.incompleteExecutions()[0];
    if (execution === undefined) return;
    const remote = await this.#options.coordinator.getRecoverySnapshot({
      jobId: execution.jobId,
    });
    const lease = remote.leases.find(
      ({ id, status }) => id === execution.leaseId && status === 'active',
    );
    if (lease !== undefined && lease.nodeId !== this.#options.nodeId) {
      throw new Error('The interrupted lease is no longer owned by this node');
    }
    if (lease !== undefined) {
      const coordinator = new JournaledJobCoordinator(
        this.#options.coordinator,
        this.#options.repositories,
        execution.id,
      );
      if (execution.runId === null) {
        await coordinator.releaseLease({ leaseId: lease.id });
      } else {
        await coordinator.failRun({
          leaseId: lease.id,
          runId: execution.runId,
          failure: {
            kind: 'node_disconnected',
            retryable: true,
            code: 'desktop_process_interrupted',
            message: 'The desktop process stopped during execution.',
          },
        });
      }
    }
    this.#options.repositories.markTerminal(execution.id, 'interrupted', {
      code: 'desktop_process_interrupted',
      message: 'The interrupted contribution was ended safely.',
      retryable: true,
    });
  }

  public async reconcileExecution(
    execution: PersistedExecution,
  ): Promise<string | undefined> {
    this.#options.repositories.updateExecution(execution.id, {
      recoveryStatus: 'reconciling',
    });
    const remote = await this.#options.coordinator.getRecoverySnapshot({
      jobId: execution.jobId,
    });
    this.#options.repositories.updateExecution(execution.id, {
      remoteSnapshotJson: JSON.stringify(remote.job),
    });
    const lease =
      (execution.leaseId === null
        ? undefined
        : remote.leases.find(({ id }) => id === execution.leaseId)) ??
      remote.leases.find(({ status }) => status === 'active');
    if (execution.leaseId === null && lease !== undefined) {
      this.#options.repositories.bindLease(execution.id, lease.id, lease.runId);
      execution = this.#options.repositories.execution(execution.id)!;
    }
    const classification = classifyRecovery(
      execution,
      remote,
      this.#options.nodeId,
      this.#options.now?.() ?? Date.now(),
    );
    const coordinator = new JournaledJobCoordinator(
      this.#options.coordinator,
      this.#options.repositories,
      execution.id,
    );
    switch (classification.kind) {
      case 'remote_completed':
        this.#options.repositories.markTerminal(execution.id, 'completed');
        return undefined;
      case 'remote_failed':
        this.#options.repositories.markTerminal(execution.id, 'failed', {
          code: 'remote_terminal',
          message: classification.message,
          retryable: remote.job.status !== 'failed_final',
        });
        return undefined;
      case 'lease_inactive':
        this.#options.repositories.markTerminal(execution.id, 'interrupted', {
          code: 'lease_inactive_after_restart',
          message:
            'The lease expired or was released while Causaic was offline.',
          retryable: true,
        });
        return undefined;
      case 'ownership_conflict':
        this.#options.repositories.updateExecution(execution.id, {
          recoveryStatus: 'attention_required',
        });
        return `${execution.jobId} is no longer owned by this node.`;
      case 'pending_approval':
        {
          const attempted = this.#options.repositories.pendingApproval(
            execution.id,
          );
          if (
            attempted?.attemptedDecision !== null &&
            attempted?.attemptedDecision !== undefined &&
            execution.leaseId !== null
          ) {
            const decidedAt = new Date(
              attempted.decisionAttemptedAt ??
                this.#options.now?.() ??
                Date.now(),
            ).toISOString();
            await coordinator.resolveApproval({
              leaseId: execution.leaseId,
              decision:
                attempted.attemptedDecision === 'approved'
                  ? {
                      protocolVersion: 1,
                      messageType: 'approval.decision',
                      approvalId: ApprovalIdSchema.parse(attempted.id),
                      messageId: MessageIdSchema.parse(
                        `message_recovery-${attempted.id}`,
                      ),
                      decision: 'approved',
                      decidedAt,
                    }
                  : {
                      protocolVersion: 1,
                      messageType: 'approval.decision',
                      approvalId: ApprovalIdSchema.parse(attempted.id),
                      messageId: MessageIdSchema.parse(
                        `message_recovery-${attempted.id}`,
                      ),
                      decision: 'denied',
                      reason:
                        attempted.denialReason ??
                        'The recovered approval was denied.',
                      decidedAt,
                    },
            });
            return this.reconcileExecution(
              this.#options.repositories.execution(execution.id)!,
            );
          }
        }
        this.#options.repositories.recordApproval({
          id: ApprovalIdSchema.parse(classification.approvalId),
          executionId: execution.id,
          ...(execution.runId === null ? {} : { runId: execution.runId }),
          domain: 'recovered_approval',
          reason: classification.reason,
          requestedAt: Date.parse(classification.requestedAt),
        });
        this.#options.repositories.updateExecution(execution.id, {
          lifecycleStatus: 'awaiting_approval',
          recoveryStatus: 'attention_required',
        });
        return `${execution.jobId} was interrupted while awaiting approval.`;
      case 'release_unstarted':
        if (execution.leaseId !== null) {
          await coordinator.releaseLease({ leaseId: execution.leaseId });
        }
        this.#options.repositories.markTerminal(execution.id, 'interrupted', {
          code: 'interrupted_before_run_start',
          message: 'The desktop stopped before the run started.',
          retryable: true,
        });
        return undefined;
      case 'fail_interrupted':
        if (execution.leaseId !== null && execution.runId !== null) {
          await coordinator.failRun({
            leaseId: execution.leaseId,
            runId: execution.runId,
            failure: {
              kind: 'node_disconnected',
              retryable: true,
              code: 'desktop_process_interrupted',
              message: 'The desktop process stopped during execution.',
            },
          });
        }
        this.#options.repositories.markTerminal(execution.id, 'interrupted', {
          code: 'desktop_process_interrupted',
          message: 'The desktop process stopped during execution.',
          retryable: true,
        });
        return undefined;
      case 'submit_local_artifact':
        await this.#submitAndComplete(execution, remote, coordinator);
        return undefined;
      case 'confirm_completion':
        if (execution.leaseId === null || execution.runId === null) {
          return `${execution.jobId} has incomplete local ownership metadata.`;
        }
        await coordinator.completeRun({
          jobId: execution.jobId,
          leaseId: execution.leaseId,
          runId: execution.runId,
          artifactId: ArtifactIdSchema.parse(classification.artifactId),
        });
        this.#options.repositories.markTerminal(execution.id, 'completed');
        return undefined;
    }
  }

  public async retryPendingOperations(
    executionId: PersistedExecution['id'],
  ): Promise<string | undefined> {
    const execution = this.#options.repositories.execution(executionId);
    if (execution === undefined) return 'The local execution no longer exists.';
    return this.reconcileExecution(execution);
  }

  async #submitAndComplete(
    execution: PersistedExecution,
    remote: JobRecoverySnapshot,
    coordinator: JobCoordinator,
  ): Promise<void> {
    const localArtifact = this.#options.repositories.artifactsForExecution(
      execution.id,
    )[0];
    if (
      localArtifact === undefined ||
      execution.leaseId === null ||
      execution.runId === null
    ) {
      throw new Error('Recovery artifact metadata is incomplete');
    }
    const path = join(this.#options.artifactRoot, localArtifact.relativePath);
    const definition = await coordinator.getWorkflowDefinition({
      jobId: remote.job.id,
      workflowVersionId: remote.job.workflowVersionId,
    });
    const content = await new WorkflowArtifactValidator().validate(
      JSON.parse(await readFile(path, 'utf8')) as unknown,
      definition,
    );
    if (content.contentHash !== localArtifact.contentHash) {
      this.#options.repositories.markArtifactSubmission(
        ArtifactIdSchema.parse(localArtifact.id),
        'conflict',
      );
      throw new Error('Recovery artifact hash mismatch');
    }
    const artifactId = ArtifactIdSchema.parse(localArtifact.id);
    if (!remote.artifacts.some(({ id }) => id === artifactId)) {
      await coordinator.submitArtifact({
        jobId: execution.jobId,
        leaseId: LeaseIdSchema.parse(execution.leaseId),
        runId: RunIdSchema.parse(execution.runId),
        artifactId,
        contentHash: content.contentHash,
        content: content.content,
      });
    }
    await coordinator.completeRun({
      jobId: execution.jobId,
      leaseId: execution.leaseId,
      runId: execution.runId,
      artifactId,
    });
    this.#options.repositories.markTerminal(execution.id, 'completed');
  }
}
