import { z } from 'zod';

import {
  CampaignIdSchema,
  ArtifactIdSchema,
  CauseIdSchema,
  JobIdSchema,
  RunIdSchema,
  UserIdSchema,
  WorkflowIdSchema,
  WorkflowVersionIdSchema,
  WorkstreamIdSchema,
} from './identifiers.js';
import { ValidationRunSummarySchema } from './agent-task.js';
import {
  JsonValueSchema,
  WorkflowSchemaDescriptorSchema,
} from './workflow-data.js';

export const MAX_REQUIRED_ACCEPTED_RUNS = 100;
export const MAX_JOB_PRIORITY = 100;

export const ManagedJobStatusSchema = z.enum([
  'draft',
  'available',
  'leased',
  'preparing',
  'running',
  'awaiting_approval',
  'validating',
  'paused',
  'completed',
  'failed_retryable',
  'failed_final',
  'cancelled',
  'closed',
  'archived',
]);
export type ManagedJobStatus = z.infer<typeof ManagedJobStatusSchema>;

export const JobDraftInputSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    summary: z
      .string()
      .trim()
      .max(280)
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    input: JsonValueSchema,
    validationParameters: JsonValueSchema.optional(),
    requiredAcceptedRuns: z
      .number()
      .int()
      .min(1)
      .max(MAX_REQUIRED_ACCEPTED_RUNS),
    priority: z.number().int().min(0).max(MAX_JOB_PRIORITY).default(0),
    availableFrom: z.number().finite().optional(),
    availableUntil: z.number().finite().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.availableFrom !== undefined &&
      value.availableUntil !== undefined &&
      value.availableFrom >= value.availableUntil
    ) {
      context.addIssue({
        code: 'custom',
        path: ['availableUntil'],
        message: 'Availability must end after it starts.',
      });
    }
  });
export type JobDraftInput = z.input<typeof JobDraftInputSchema>;
export type NormalizedJobDraftInput = z.output<typeof JobDraftInputSchema>;

export const ManagedJobAllowedActionsSchema = z
  .object({
    edit: z.boolean(),
    publish: z.boolean(),
    pause: z.boolean(),
    resume: z.boolean(),
    close: z.boolean(),
    duplicate: z.boolean(),
    archive: z.boolean(),
  })
  .strict();
export type ManagedJobAllowedActions = z.infer<
  typeof ManagedJobAllowedActionsSchema
>;

export const ManagedJobWorkflowSchema = z
  .object({
    familyId: WorkflowIdSchema,
    familyName: z.string(),
    familyStatus: z.enum(['active', 'archived']),
    versionId: WorkflowVersionIdSchema,
    version: z.string(),
    versionStatus: z.enum(['draft', 'published', 'deprecated', 'revoked']),
    inputSchema: WorkflowSchemaDescriptorSchema,
    validationPolicy: z
      .enum(['advisory', 'human_confirmation', 'automatic'])
      .optional(),
    validationParametersSchema: WorkflowSchemaDescriptorSchema.optional(),
  })
  .strict();

export const ManagedJobSummarySchema = z
  .object({
    id: JobIdSchema,
    causeId: CauseIdSchema,
    campaignId: CampaignIdSchema,
    workstreamId: WorkstreamIdSchema,
    title: z.string(),
    summary: z.string().optional(),
    status: ManagedJobStatusSchema,
    workflow: ManagedJobWorkflowSchema,
    requiredAcceptedRuns: z.number().int().positive(),
    acceptedRunCount: z.number().int().nonnegative(),
    priority: z.number().int(),
    availableFrom: z.number().optional(),
    availableUntil: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export type ManagedJobSummary = z.infer<typeof ManagedJobSummarySchema>;

export const ManagedJobRunSummarySchema = z
  .object({
    id: RunIdSchema,
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
    runtimeType: z.string(),
    currentPhase: z.string().optional(),
    progressMessage: z.string().optional(),
    startedAt: z.number(),
    completedAt: z.number().optional(),
  })
  .strict();

export const ManagedJobSchema = ManagedJobSummarySchema.extend({
  workstreamName: z.string(),
  campaignName: z.string(),
  input: JsonValueSchema,
  validationParameters: JsonValueSchema.optional(),
  createdBy: UserIdSchema,
  attemptCount: z.number().int().nonnegative(),
  publishedAt: z.number().optional(),
  completedAt: z.number().optional(),
  closedAt: z.number().optional(),
  archivedAt: z.number().optional(),
  recentRuns: z.array(ManagedJobRunSummarySchema),
  recentArtifacts: z.array(
    z
      .object({
        id: ArtifactIdSchema,
        status: z.enum([
          'submitted',
          'validating',
          'awaiting_review',
          'accepted',
          'rejected',
        ]),
        content: JsonValueSchema,
        createdAt: z.number(),
        validationRuns: z.array(ValidationRunSummarySchema),
      })
      .strict(),
  ),
  allowedActions: ManagedJobAllowedActionsSchema,
}).strict();
export type ManagedJob = z.infer<typeof ManagedJobSchema>;

export const JobManagementErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'CAUSE_PERMISSION_DENIED',
  'CAMPAIGN_NOT_FOUND',
  'WORKSTREAM_NOT_FOUND',
  'JOB_NOT_FOUND',
  'INVALID_JOB_INPUT',
  'INVALID_WORKFLOW_INPUT',
  'JOB_PERMISSION_DENIED',
  'JOB_OWNER_REQUIRED',
  'CAMPAIGN_JOB_CREATION_NOT_ALLOWED',
  'WORKSTREAM_JOB_CREATION_NOT_ALLOWED',
  'WORKFLOW_VERSION_UNAVAILABLE',
  'WORKFLOW_VERSION_REVOKED',
  'INVALID_ACCEPTED_RUN_TARGET',
  'FIXED_BATCH_INVENTORY_EXHAUSTED',
  'INVALID_JOB_TRANSITION',
  'PUBLISHED_JOB_IMMUTABLE',
  'JOB_HAS_ACTIVE_RUN',
  'JOB_ARCHIVED',
]);
export type JobManagementErrorCode = z.infer<
  typeof JobManagementErrorCodeSchema
>;
