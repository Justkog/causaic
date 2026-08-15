import type { JobRecoverySnapshot } from '@causaic/coordinator-core';
import type { NodeId } from '@causaic/protocol';

import type { PersistedExecution } from '../persistence/models.js';

export type RecoveryClassification =
  | { readonly kind: 'remote_completed' }
  | { readonly kind: 'remote_failed'; readonly message: string }
  | { readonly kind: 'ownership_conflict' }
  | { readonly kind: 'lease_inactive' }
  | { readonly kind: 'release_unstarted' }
  | {
      readonly kind: 'pending_approval';
      readonly approvalId: string;
      readonly reason: string;
      readonly requestedAt: string;
    }
  | { readonly kind: 'submit_local_artifact' }
  | { readonly kind: 'confirm_completion'; readonly artifactId: string }
  | { readonly kind: 'fail_interrupted' };

export function classifyRecovery(
  local: PersistedExecution,
  remote: JobRecoverySnapshot,
  configuredNodeId: NodeId,
  now: number,
): RecoveryClassification {
  if (remote.job.status === 'completed') return { kind: 'remote_completed' };
  if (
    remote.job.status === 'failed_final' ||
    remote.job.status === 'cancelled'
  ) {
    return {
      kind: 'remote_failed',
      message:
        remote.job.run?.failure?.message ?? 'The remote execution is terminal.',
    };
  }

  const lease =
    (local.leaseId === null
      ? undefined
      : remote.leases.find(({ id }) => id === local.leaseId)) ??
    remote.leases.find(({ status }) => status === 'active');
  if (lease === undefined || lease.status !== 'active') {
    return { kind: 'lease_inactive' };
  }
  if (lease.nodeId !== configuredNodeId) return { kind: 'ownership_conflict' };
  if (Date.parse(lease.expiresAt) <= now) return { kind: 'lease_inactive' };

  const run = remote.runs.find(({ id }) => id === lease.runId);
  if (run === undefined || run.status === 'created') {
    return { kind: 'release_unstarted' };
  }
  if (run.status === 'completed') return { kind: 'remote_completed' };
  if (run.status === 'failed' || run.status === 'cancelled') {
    return {
      kind: 'remote_failed',
      message: run.failureMessage ?? 'The remote run is terminal.',
    };
  }

  const approval = remote.approvals
    .filter(({ runId }) => runId === run.id)
    .sort(
      (left, right) =>
        Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
    )[0];
  if (approval?.status === 'pending') {
    return {
      kind: 'pending_approval',
      approvalId: approval.id,
      reason: approval.reason,
      requestedAt: approval.requestedAt,
    };
  }

  const remoteArtifact = remote.artifacts.find(({ runId }) => runId === run.id);
  if (remoteArtifact !== undefined) {
    return {
      kind: 'confirm_completion',
      artifactId: remoteArtifact.id,
    };
  }
  if (
    local.lifecycleStatus === 'artifact_persisted' ||
    local.lifecycleStatus === 'artifact_submitted' ||
    local.lifecycleStatus === 'completion_pending'
  ) {
    return { kind: 'submit_local_artifact' };
  }
  return { kind: 'fail_interrupted' };
}
