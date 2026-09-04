import {
  ArtifactIdSchema,
  ExecutorIdSchema,
  LeaseIdSchema,
  MessageIdSchema,
  NodeIdSchema,
  RunIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import type {
  ClaimedContribution,
  JobId,
  JsonValue,
  NodeId,
  OpportunityId,
} from '@causaic/protocol';
import { sha256Json } from '@causaic/workflow-schema';
import { describe, expect, it } from 'vitest';

import type { JobCoordinator } from './coordinator.js';

export interface JobCoordinatorTestHarness {
  readonly coordinator: JobCoordinator;
  readonly jobId: JobId;
  /** Node identity used by coordinators that bind claims to a configured node. */
  readonly nodeId?: NodeId;
  readonly artifact: JsonValue;
}

export function defineJobCoordinatorContract(
  createHarness: () => Promise<JobCoordinatorTestHarness>,
): void {
  const opportunityIds = new WeakMap<
    JobCoordinatorTestHarness,
    OpportunityId
  >();
  const claimIds = new WeakMap<
    JobCoordinatorTestHarness,
    {
      leaseId: ReturnType<typeof LeaseIdSchema.parse>;
      runId: ReturnType<typeof RunIdSchema.parse>;
    }
  >();
  const claim = async (
    harness: JobCoordinatorTestHarness,
    overrides: Partial<{
      leaseId: ReturnType<typeof LeaseIdSchema.parse>;
      runId: ReturnType<typeof RunIdSchema.parse>;
    }> = {},
  ) => {
    let opportunityId = opportunityIds.get(harness);
    if (opportunityId === undefined) {
      const opportunities =
        await harness.coordinator.listAvailableOpportunities({});
      const opportunity = opportunities[0];
      if (opportunity === undefined)
        throw new Error('Coordinator contract opportunity is missing');
      opportunityId = opportunity.id;
      opportunityIds.set(harness, opportunityId);
    }
    let identities = claimIds.get(harness);
    if (identities === undefined) {
      identities = {
        leaseId: LeaseIdSchema.parse(
          `lease_contract-${harness.jobId.slice('job_'.length)}`,
        ),
        runId: RunIdSchema.parse(
          `run_contract-${harness.jobId.slice('job_'.length)}`,
        ),
      };
      claimIds.set(harness, identities);
    }
    return harness.coordinator.claimOpportunity({
      opportunityId,
      leaseId: overrides.leaseId ?? identities.leaseId,
      runId: overrides.runId ?? identities.runId,
      nodeId: harness.nodeId ?? NodeIdSchema.parse('node_contract'),
      executorId: ExecutorIdSchema.parse('executor_contract'),
      contributorId: UserIdSchema.parse('user_contract'),
      executorType: 'plugin_host',
      durationMs: 60_000,
    });
  };
  const start = async (
    harness: JobCoordinatorTestHarness,
    contribution: ClaimedContribution,
  ) => {
    const lease = contribution.lease;
    await harness.coordinator.startRun({
      jobId: contribution.job.id,
      leaseId: lease.id,
      runId: lease.runId,
    });
    await harness.coordinator.reportProgress({
      leaseId: lease.id,
      event: {
        protocolVersion: 1,
        messageType: 'job.progress',
        messageId: MessageIdSchema.parse('message_contract-running'),
        jobId: contribution.job.id,
        runId: lease.runId,
        sequence: 1,
        occurredAt: lease.leasedAt,
        eventType: 'phase.changed',
        status: 'running',
      },
    });
  };

  describe('JobCoordinator contract', () => {
    it('lists and claims an available opportunity', async () => {
      const harness = await createHarness();
      const opportunities =
        await harness.coordinator.listAvailableOpportunities({});
      expect(opportunities).toHaveLength(1);
      await expect(claim(harness)).resolves.toMatchObject({
        opportunityId: opportunities[0]?.id,
        job: { id: harness.jobId },
        lease: { jobId: harness.jobId, status: 'active' },
      });
    });

    it('allows only one active lease', async () => {
      const harness = await createHarness();
      await claim(harness);
      await expect(
        claim(harness, {
          leaseId: LeaseIdSchema.parse('lease_contract-conflict'),
          runId: RunIdSchema.parse('run_contract-conflict'),
        }),
      ).rejects.toMatchObject({
        code: 'lease_conflict',
      });
    });

    it('returns the original claim for an exact retry', async () => {
      const harness = await createHarness();
      const first = await claim(harness);
      await expect(claim(harness)).resolves.toMatchObject({
        opportunityId: first.opportunityId,
        job: { id: first.job.id },
        lease: { id: first.lease.id, runId: first.lease.runId },
      });
    });

    it('requires a valid lease to start a run', async () => {
      const harness = await createHarness();
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await expect(
        harness.coordinator.startRun({
          jobId: contribution.job.id,
          leaseId: lease.id,
          runId: lease.runId,
        }),
      ).resolves.toMatchObject({ id: lease.runId });
    });

    it('handles duplicate and stale progress deterministically', async () => {
      const harness = await createHarness();
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await start(harness, contribution);
      const stale = {
        protocolVersion: 1 as const,
        messageType: 'job.progress' as const,
        messageId: MessageIdSchema.parse('message_contract-stale'),
        jobId: contribution.job.id,
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
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await start(harness, contribution);
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
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await start(harness, contribution);
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
          jobId: contribution.job.id,
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
          jobId: contribution.job.id,
          leaseId: lease.id,
          runId: lease.runId,
          artifactId,
        }),
      ).rejects.toMatchObject({ code: 'artifact_rejected' });
      await harness.coordinator.submitArtifact({
        jobId: contribution.job.id,
        leaseId: lease.id,
        runId: lease.runId,
        artifactId,
        contentHash: await sha256Json(harness.artifact),
        content: harness.artifact,
      });
      await expect(
        harness.coordinator.completeRun({
          jobId: contribution.job.id,
          leaseId: lease.id,
          runId: lease.runId,
          artifactId,
        }),
      ).resolves.toBeUndefined();
      await expect(
        harness.coordinator.listAvailableOpportunities({}),
      ).resolves.toHaveLength(0);
    });

    it('returns an unfinished released job to availability', async () => {
      const harness = await createHarness();
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await start(harness, contribution);
      await harness.coordinator.releaseLease({ leaseId: lease.id });
      await expect(
        harness.coordinator.listAvailableOpportunities({}),
      ).resolves.toHaveLength(1);
    });

    it('preserves retryable run failures for reassignment', async () => {
      const harness = await createHarness();
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await start(harness, contribution);
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
        harness.coordinator.getJobState({ jobId: contribution.job.id }),
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
        harness.coordinator.listAvailableOpportunities({}),
      ).resolves.toHaveLength(1);
    });

    it('preserves final run failures as terminal', async () => {
      const harness = await createHarness();
      const contribution = await claim(harness);
      const lease = contribution.lease;
      await start(harness, contribution);
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
        harness.coordinator.getJobState({ jobId: contribution.job.id }),
      ).resolves.toMatchObject({
        status: 'failed_final',
        run: {
          status: 'failed',
          failure: { retryable: false, code: 'artifact_invalid' },
        },
      });
      await expect(
        harness.coordinator.listAvailableOpportunities({}),
      ).resolves.toHaveLength(0);
    });
  });
}
