import {
  ArtifactIdSchema,
  ExecutorIdSchema,
  MessageIdSchema,
  NodeIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import type { JobId, JobLease, JsonValue } from '@causaic/protocol';
import { sha256Json } from '@causaic/workflow-schema';
import { describe, expect, it } from 'vitest';

import type { JobCoordinator } from './coordinator.js';

export interface JobCoordinatorTestHarness {
  readonly coordinator: JobCoordinator;
  readonly jobId: JobId;
  readonly artifact: JsonValue;
}

export function defineJobCoordinatorContract(
  createHarness: () => Promise<JobCoordinatorTestHarness>,
): void {
  const acquire = async (harness: JobCoordinatorTestHarness) =>
    harness.coordinator.acquireLease({
      jobId: harness.jobId,
      nodeId: NodeIdSchema.parse('node_contract'),
      executorId: ExecutorIdSchema.parse('executor_contract'),
      contributorId: UserIdSchema.parse('user_contract'),
      executorType: 'plugin_host',
      durationMs: 60_000,
    });
  const start = async (harness: JobCoordinatorTestHarness, lease: JobLease) => {
    await harness.coordinator.startRun({
      jobId: harness.jobId,
      leaseId: lease.id,
      runId: lease.runId,
    });
    await harness.coordinator.reportProgress({
      leaseId: lease.id,
      event: {
        protocolVersion: 1,
        messageType: 'job.progress',
        messageId: MessageIdSchema.parse('message_contract-running'),
        jobId: harness.jobId,
        runId: lease.runId,
        sequence: 1,
        occurredAt: lease.leasedAt,
        eventType: 'phase.changed',
        status: 'running',
      },
    });
  };

  describe('JobCoordinator contract', () => {
    it('lists and acquires an available job', async () => {
      const harness = await createHarness();
      await expect(
        harness.coordinator.listAvailableJobs({}),
      ).resolves.toHaveLength(1);
      await expect(acquire(harness)).resolves.toMatchObject({
        jobId: harness.jobId,
        status: 'active',
      });
    });

    it('allows only one active lease', async () => {
      const harness = await createHarness();
      await acquire(harness);
      await expect(acquire(harness)).rejects.toMatchObject({
        code: 'lease_conflict',
      });
    });

    it('requires a valid lease to start a run', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await expect(
        harness.coordinator.startRun({
          jobId: harness.jobId,
          leaseId: lease.id,
          runId: lease.runId,
        }),
      ).resolves.toMatchObject({ id: lease.runId });
    });

    it('handles duplicate and stale progress deterministically', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await start(harness, lease);
      const stale = {
        protocolVersion: 1 as const,
        messageType: 'job.progress' as const,
        messageId: MessageIdSchema.parse('message_contract-stale'),
        jobId: harness.jobId,
        runId: lease.runId,
        sequence: 0,
        occurredAt: lease.leasedAt,
        eventType: 'progress.reported' as const,
        message: 'stale',
      };
      await expect(
        harness.coordinator.reportProgress({ leaseId: lease.id, event: stale }),
      ).resolves.toBeUndefined();
      await expect(
        harness.coordinator.reportProgress({ leaseId: lease.id, event: stale }),
      ).resolves.toBeUndefined();
    });

    it('pauses for approval and permits one resolution', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await start(harness, lease);
      const approval = await harness.coordinator.requestApproval({
        leaseId: lease.id,
        runId: lease.runId,
        reason: 'Submit result',
        expiresInMs: 30_000,
      });
      const decision = {
        protocolVersion: 1 as const,
        messageType: 'approval.decision' as const,
        messageId: MessageIdSchema.parse('message_contract-decision'),
        approvalId: approval.id,
        decision: 'approved' as const,
        decidedAt: lease.leasedAt,
      };
      await expect(
        harness.coordinator.resolveApproval({ leaseId: lease.id, decision }),
      ).resolves.toBeUndefined();
      await expect(
        harness.coordinator.resolveApproval({
          leaseId: lease.id,
          decision: { ...decision, decision: 'denied', reason: 'No' },
        }),
      ).rejects.toMatchObject({ code: 'approval_already_resolved' });
    });

    it('requires an artifact and completes with a valid artifact', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await start(harness, lease);
      const approval = await harness.coordinator.requestApproval({
        leaseId: lease.id,
        runId: lease.runId,
        reason: 'Submit result',
        expiresInMs: 30_000,
      });
      await harness.coordinator.resolveApproval({
        leaseId: lease.id,
        decision: {
          protocolVersion: 1,
          messageType: 'approval.decision',
          messageId: MessageIdSchema.parse(
            'message_contract-complete-decision',
          ),
          approvalId: approval.id,
          decision: 'approved',
          decidedAt: lease.leasedAt,
        },
      });
      await harness.coordinator.reportProgress({
        leaseId: lease.id,
        event: {
          protocolVersion: 1,
          messageType: 'job.progress',
          messageId: MessageIdSchema.parse('message_contract-validating'),
          jobId: harness.jobId,
          runId: lease.runId,
          sequence: 2,
          occurredAt: lease.leasedAt,
          eventType: 'phase.changed',
          status: 'validating',
        },
      });
      const artifactId = ArtifactIdSchema.parse('artifact_contract');
      await expect(
        harness.coordinator.completeRun({
          jobId: harness.jobId,
          leaseId: lease.id,
          runId: lease.runId,
          artifactId,
        }),
      ).rejects.toMatchObject({ code: 'artifact_rejected' });
      await harness.coordinator.submitArtifact({
        jobId: harness.jobId,
        leaseId: lease.id,
        runId: lease.runId,
        artifactId,
        contentHash: await sha256Json(harness.artifact),
        content: harness.artifact,
      });
      await expect(
        harness.coordinator.completeRun({
          jobId: harness.jobId,
          leaseId: lease.id,
          runId: lease.runId,
          artifactId,
        }),
      ).resolves.toBeUndefined();
      await expect(
        harness.coordinator.listAvailableJobs({}),
      ).resolves.toHaveLength(0);
    });

    it('returns an unfinished released job to availability', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await start(harness, lease);
      await harness.coordinator.releaseLease({ leaseId: lease.id });
      await expect(
        harness.coordinator.listAvailableJobs({}),
      ).resolves.toHaveLength(1);
    });

    it('preserves retryable run failures for reassignment', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await start(harness, lease);
      await harness.coordinator.failRun({
        leaseId: lease.id,
        runId: lease.runId,
        failure: {
          kind: 'temporary_network_failure',
          retryable: true,
          code: 'runtime_temporarily_unavailable',
          message: 'The runtime is temporarily unavailable',
        },
      });
      await expect(
        harness.coordinator.getJobState({ jobId: harness.jobId }),
      ).resolves.toMatchObject({
        status: 'available',
        run: {
          status: 'failed',
          failure: {
            retryable: true,
            code: 'runtime_temporarily_unavailable',
          },
        },
      });
      await expect(
        harness.coordinator.listAvailableJobs({}),
      ).resolves.toHaveLength(1);
    });

    it('preserves final run failures as terminal', async () => {
      const harness = await createHarness();
      const lease = await acquire(harness);
      await start(harness, lease);
      await harness.coordinator.failRun({
        leaseId: lease.id,
        runId: lease.runId,
        failure: {
          kind: 'invalid_workflow_output',
          retryable: false,
          code: 'artifact_invalid',
          message: 'The runtime produced an invalid artifact',
        },
      });
      await expect(
        harness.coordinator.getJobState({ jobId: harness.jobId }),
      ).resolves.toMatchObject({
        status: 'failed_final',
        run: {
          status: 'failed',
          failure: { retryable: false, code: 'artifact_invalid' },
        },
      });
      await expect(
        harness.coordinator.listAvailableJobs({}),
      ).resolves.toHaveLength(0);
    });
  });
}
