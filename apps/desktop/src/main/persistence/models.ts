import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  ExecutorIdSchema,
  JobIdSchema,
  LeaseIdSchema,
  NodeIdSchema,
  RunIdSchema,
} from '@causaic/protocol';
import { z } from 'zod';

export const LocalExecutionIdSchema = z
  .string()
  .regex(/^local-execution_[A-Za-z0-9-]+$/);
export type LocalExecutionId = z.infer<typeof LocalExecutionIdSchema>;

export const ExecutionLifecycleStatusSchema = z.enum([
  'selected',
  'leasing',
  'starting_run',
  'running',
  'awaiting_approval',
  'validating',
  'artifact_persisted',
  'artifact_submitted',
  'completion_pending',
  'cleanup_pending',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
]);
export type ExecutionLifecycleStatus = z.infer<
  typeof ExecutionLifecycleStatusSchema
>;

export const ExecutionRecoveryStatusSchema = z.enum([
  'pending',
  'reconciling',
  'reconciled',
  'attention_required',
]);
export type ExecutionRecoveryStatus = z.infer<
  typeof ExecutionRecoveryStatusSchema
>;

const OperationBaseSchema = z.object({
  jobId: JobIdSchema,
  leaseId: LeaseIdSchema.optional(),
  runId: RunIdSchema.optional(),
});

export const PendingOperationPayloadSchema = z.discriminatedUnion('kind', [
  OperationBaseSchema.extend({ kind: z.literal('acquire_lease') }),
  OperationBaseSchema.extend({
    kind: z.literal('start_run'),
    leaseId: LeaseIdSchema,
    runId: RunIdSchema,
  }),
  OperationBaseSchema.extend({
    kind: z.literal('renew_lease'),
    leaseId: LeaseIdSchema,
    durationMs: z.number().int().positive(),
  }),
  OperationBaseSchema.extend({
    kind: z.literal('request_approval'),
    leaseId: LeaseIdSchema,
    runId: RunIdSchema,
    approvalId: ApprovalIdSchema,
  }),
  OperationBaseSchema.extend({
    kind: z.literal('resolve_approval'),
    leaseId: LeaseIdSchema,
    approvalId: ApprovalIdSchema,
    decision: z.enum(['approved', 'denied']),
    reason: z.string().trim().min(1).optional(),
  }),
  OperationBaseSchema.extend({
    kind: z.literal('submit_artifact'),
    leaseId: LeaseIdSchema,
    runId: RunIdSchema,
    artifactId: ArtifactIdSchema,
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  OperationBaseSchema.extend({
    kind: z.literal('complete_run'),
    leaseId: LeaseIdSchema,
    runId: RunIdSchema,
    artifactId: ArtifactIdSchema,
  }),
  OperationBaseSchema.extend({
    kind: z.literal('fail_run'),
    leaseId: LeaseIdSchema,
    runId: RunIdSchema,
    retryable: z.boolean(),
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
  }),
  OperationBaseSchema.extend({
    kind: z.literal('release_lease'),
    leaseId: LeaseIdSchema,
  }),
]);
export type PendingOperationPayload = z.infer<
  typeof PendingOperationPayloadSchema
>;

export const PersistedExecutionSchema = z.object({
  id: LocalExecutionIdSchema,
  jobId: JobIdSchema,
  leaseId: LeaseIdSchema.nullable(),
  runId: RunIdSchema.nullable(),
  nodeId: NodeIdSchema,
  executorId: ExecutorIdSchema,
  runtimeType: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  campaignName: z.string().trim().min(1),
  lifecycleStatus: ExecutionLifecycleStatusSchema,
  recoveryStatus: ExecutionRecoveryStatusSchema,
  lastRunnerSequence: z.number().int(),
  lastProgressSequence: z.number().int(),
  progressMessage: z.string().nullable(),
  lastConfirmedRemoteStage: z.string().nullable(),
  remoteSnapshotJson: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  retryable: z.boolean().nullable(),
  cancellationRequestedAt: z.number().int().nullable(),
  startedAt: z.number().int(),
  updatedAt: z.number().int(),
  terminalAt: z.number().int().nullable(),
  terminalNotifiedAt: z.number().int().nullable(),
});
export type PersistedExecution = z.infer<typeof PersistedExecutionSchema>;
