import { z } from 'zod';

import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  CampaignIdSchema,
  CauseIdSchema,
  ExecutorIdSchema,
  JobIdSchema,
  LeaseIdSchema,
  RunIdSchema,
  UserIdSchema,
} from './identifiers.js';
import { JobStatusSchema, TimestampSchema } from './schemas.js';

export const RunStatusSchema = z.enum([
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
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RetryableFailureReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runtime_crashed') }).strict(),
  z
    .object({
      kind: z.literal('provider_limit_reached'),
      resetsAt: TimestampSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('temporary_network_failure') }).strict(),
  z.object({ kind: z.literal('node_disconnected') }).strict(),
  z.object({ kind: z.literal('artifact_upload_failed') }).strict(),
  z.object({ kind: z.literal('invalid_workflow_output') }).strict(),
]);
export type RetryableFailureReason = z.infer<
  typeof RetryableFailureReasonSchema
>;

const RunFailureDetailsSchema = z
  .object({
    retryable: z.boolean(),
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
  })
  .strict();

export const RunFailureSchema = z.intersection(
  RetryableFailureReasonSchema,
  RunFailureDetailsSchema,
);
export type RunFailure = z.infer<typeof RunFailureSchema>;

export const CancellationReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user_cancelled') }).strict(),
  z
    .object({
      kind: z.literal('user_denied_required_approval'),
      approvalId: ApprovalIdSchema,
    })
    .strict(),
]);
export type CancellationReason = z.infer<typeof CancellationReasonSchema>;

export const RetryPolicySchema = z
  .object({
    allowReassignment: z.boolean(),
    maxAttempts: z.number().int().positive(),
    deadline: TimestampSchema.optional(),
    retryNotBefore: TimestampSchema.optional(),
    requiresCheckpointForRetry: z.boolean().optional(),
  })
  .strict();
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export const LeaseStateSchema = z
  .object({
    id: LeaseIdSchema,
    runId: RunIdSchema,
    executorId: ExecutorIdSchema,
    contributorId: UserIdSchema,
    status: z.enum(['active', 'released', 'expired']),
    acquiredAt: TimestampSchema,
    expiresAt: TimestampSchema,
    endedAt: TimestampSchema.optional(),
  })
  .strict();
export type LeaseState = z.infer<typeof LeaseStateSchema>;

export const RunStateSchema = z
  .object({
    id: RunIdSchema,
    status: RunStatusSchema,
    failure: RunFailureSchema.optional(),
    cancellationReason: CancellationReasonSchema.optional(),
  })
  .strict();
export type RunState = z.infer<typeof RunStateSchema>;

export const ApprovalStateSchema = z.discriminatedUnion('status', [
  z
    .object({
      id: ApprovalIdSchema,
      status: z.literal('pending'),
      reason: z.string().trim().min(1),
      requestedAt: TimestampSchema,
      expiresAt: TimestampSchema,
    })
    .strict(),
  z
    .object({
      id: ApprovalIdSchema,
      status: z.literal('approved'),
      reason: z.string().trim().min(1),
      requestedAt: TimestampSchema,
      expiresAt: TimestampSchema,
      resolvedAt: TimestampSchema,
    })
    .strict(),
  z
    .object({
      id: ApprovalIdSchema,
      status: z.literal('denied'),
      reason: z.string().trim().min(1),
      requestedAt: TimestampSchema,
      expiresAt: TimestampSchema,
      resolvedAt: TimestampSchema,
      denialReason: z.string().trim().min(1),
    })
    .strict(),
]);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

export const JobStateSchema = z
  .object({
    id: JobIdSchema,
    campaignId: CampaignIdSchema,
    causeId: CauseIdSchema,
    status: JobStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    retryPolicy: RetryPolicySchema,
    lease: LeaseStateSchema.optional(),
    run: RunStateSchema.optional(),
    approval: ApprovalStateSchema.optional(),
    acceptedArtifactId: ArtifactIdSchema.optional(),
  })
  .strict();
export type JobState = z.infer<typeof JobStateSchema>;
