import { z } from 'zod';

import {
  CampaignIdSchema,
  UserIdSchema,
  WorkflowIdSchema,
  WorkflowVersionIdSchema,
  WorkstreamDependencyIdSchema,
  WorkstreamIdSchema,
} from './identifiers.js';
import {
  WorkflowStatusSchema,
  WorkflowVersionStatusSchema,
} from './workflow-catalog.js';
import { CapabilityHintSchema } from './agent-task.js';
import { WorkflowSchemaDescriptorSchema } from './workflow-data.js';

export const MAX_WORKSTREAMS_PER_CAMPAIGN = 100;
export const MAX_DEPENDENCIES_PER_WORKSTREAM = 20;
export const MAX_DEPENDENCIES_PER_CAMPAIGN = 250;

export const WorkstreamStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]);
export type WorkstreamStatus = z.infer<typeof WorkstreamStatusSchema>;

export const WorkstreamAvailabilityPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }).strict(),
  z.object({ type: z.literal('when_campaign_active') }).strict(),
  z.object({ type: z.literal('after_dependencies') }).strict(),
]);
export type WorkstreamAvailabilityPolicy = z.infer<
  typeof WorkstreamAvailabilityPolicySchema
>;

export const WorkstreamInventoryPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual_jobs') }).strict(),
  z
    .object({
      type: z.literal('fixed_batch'),
      targetJobCount: z.number().int().min(1).max(10_000),
    })
    .strict(),
]);
export type WorkstreamInventoryPolicy = z.infer<
  typeof WorkstreamInventoryPolicySchema
>;

export const WorkstreamParticipationPolicySchema = z
  .object({
    maxRunsPerContributor: z.number().int().min(1).max(10_000).optional(),
    maxConcurrentRunsPerContributor: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.maxRunsPerContributor !== undefined &&
      value.maxConcurrentRunsPerContributor !== undefined &&
      value.maxConcurrentRunsPerContributor > value.maxRunsPerContributor
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxConcurrentRunsPerContributor'],
        message: 'The concurrent run limit cannot exceed the total run limit.',
      });
    }
  });
export type WorkstreamParticipationPolicy = z.infer<
  typeof WorkstreamParticipationPolicySchema
>;

export const WorkstreamCompletionPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }).strict(),
  z.object({ type: z.literal('all_jobs_completed') }).strict(),
]);
export type WorkstreamCompletionPolicy = z.infer<
  typeof WorkstreamCompletionPolicySchema
>;

export const WorkstreamDependencyConditionSchema = z.enum([
  'workstream_completed',
  'manual_release',
]);
export type WorkstreamDependencyCondition = z.infer<
  typeof WorkstreamDependencyConditionSchema
>;

export const WorkstreamDependencySelectionSchema = z
  .object({
    upstreamWorkstreamId: WorkstreamIdSchema,
    condition: WorkstreamDependencyConditionSchema,
  })
  .strict();
export type WorkstreamDependencySelection = z.infer<
  typeof WorkstreamDependencySelectionSchema
>;

export const WorkstreamProfileInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(1).max(10_000),
    required: z.boolean(),
    workflowVersionId: WorkflowVersionIdSchema,
    availabilityPolicy: WorkstreamAvailabilityPolicySchema,
    inventoryPolicy: WorkstreamInventoryPolicySchema,
    participationPolicy: WorkstreamParticipationPolicySchema,
    completionPolicy: WorkstreamCompletionPolicySchema,
  })
  .strict();
export type WorkstreamProfileInput = z.input<
  typeof WorkstreamProfileInputSchema
>;
export type NormalizedWorkstreamProfileInput = z.output<
  typeof WorkstreamProfileInputSchema
>;

export const WorkstreamAllowedActionsSchema = z
  .object({
    editProfile: z.boolean(),
    editConfiguration: z.boolean(),
    changePinnedVersion: z.boolean(),
    manageDependencies: z.boolean(),
    activate: z.boolean(),
    pause: z.boolean(),
    complete: z.boolean(),
    archive: z.boolean(),
  })
  .strict();
export type WorkstreamAllowedActions = z.infer<
  typeof WorkstreamAllowedActionsSchema
>;

export const WorkstreamWorkflowSelectionSchema = z
  .object({
    family: z
      .object({
        id: WorkflowIdSchema,
        slug: z.string(),
        name: z.string(),
        summary: z.string(),
        status: WorkflowStatusSchema,
        scope: z.enum(['platform', 'cause_private']),
      })
      .strict(),
    version: z
      .object({
        id: WorkflowVersionIdSchema,
        version: z.string(),
        status: WorkflowVersionStatusSchema,
        summary: z.string(),
        inputSchema: WorkflowSchemaDescriptorSchema,
        outputSchema: WorkflowSchemaDescriptorSchema,
        capabilityHints: z.array(CapabilityHintSchema),
        validationRequirements: z
          .object({
            capabilityHints: z.array(CapabilityHintSchema),
          })
          .strict()
          .optional(),
        validationSummary: z.string().optional(),
      })
      .strict(),
  })
  .strict();
export type WorkstreamWorkflowSelection = z.infer<
  typeof WorkstreamWorkflowSelectionSchema
>;

export const ManagedWorkstreamSummarySchema = z
  .object({
    id: WorkstreamIdSchema,
    campaignId: CampaignIdSchema,
    name: z.string(),
    description: z.string(),
    required: z.boolean(),
    status: WorkstreamStatusSchema,
    workflow: WorkstreamWorkflowSelectionSchema,
    availabilityPolicy: WorkstreamAvailabilityPolicySchema,
    inventoryPolicy: WorkstreamInventoryPolicySchema,
    completionPolicy: WorkstreamCompletionPolicySchema,
    dependencyCount: z.number().int().nonnegative(),
    jobCount: z.number().int().nonnegative(),
    updatedAt: z.number(),
  })
  .strict();
export type ManagedWorkstreamSummary = z.infer<
  typeof ManagedWorkstreamSummarySchema
>;

export const ManagedWorkstreamDependencySchema = z
  .object({
    id: WorkstreamDependencyIdSchema,
    upstreamWorkstreamId: WorkstreamIdSchema,
    upstreamWorkstreamName: z.string(),
    upstreamWorkstreamStatus: WorkstreamStatusSchema,
    condition: WorkstreamDependencyConditionSchema,
    createdAt: z.number(),
  })
  .strict();
export type ManagedWorkstreamDependency = z.infer<
  typeof ManagedWorkstreamDependencySchema
>;

export const ManagedWorkstreamDependentSchema = z
  .object({
    workstreamId: WorkstreamIdSchema,
    workstreamName: z.string(),
    workstreamStatus: WorkstreamStatusSchema,
    condition: WorkstreamDependencyConditionSchema,
  })
  .strict();
export type ManagedWorkstreamDependent = z.infer<
  typeof ManagedWorkstreamDependentSchema
>;

export const ManagedWorkstreamSchema = ManagedWorkstreamSummarySchema.extend({
  campaignName: z.string(),
  participationPolicy: WorkstreamParticipationPolicySchema,
  role: z.enum(['owner', 'operator']),
  createdBy: UserIdSchema,
  createdAt: z.number(),
  activatedAt: z.number().optional(),
  completedAt: z.number().optional(),
  archivedAt: z.number().optional(),
  dependencies: z.array(ManagedWorkstreamDependencySchema),
  dependents: z.array(ManagedWorkstreamDependentSchema),
  allowedActions: WorkstreamAllowedActionsSchema,
}).strict();
export type ManagedWorkstream = z.infer<typeof ManagedWorkstreamSchema>;

export const CampaignWorkstreamOverviewSchema = z
  .object({
    total: z.number().int().nonnegative(),
    required: z.number().int().nonnegative(),
    optional: z.number().int().nonnegative(),
    byStatus: z.array(
      z
        .object({
          status: WorkstreamStatusSchema,
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    workstreams: z.array(ManagedWorkstreamSummarySchema),
    canCreate: z.boolean(),
  })
  .strict();
export type CampaignWorkstreamOverview = z.infer<
  typeof CampaignWorkstreamOverviewSchema
>;

export const WorkstreamManagementErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'CAUSE_PERMISSION_DENIED',
  'CAUSE_ARCHIVED',
  'CAMPAIGN_NOT_FOUND',
  'CAMPAIGN_ARCHIVED',
  'INVALID_WORKSTREAM_INPUT',
  'WORKSTREAM_NOT_FOUND',
  'WORKSTREAM_LIMIT_REACHED',
  'WORKSTREAM_PERMISSION_DENIED',
  'WORKSTREAM_OWNER_REQUIRED',
  'WORKSTREAM_EDIT_NOT_ALLOWED',
  'WORKSTREAM_PINNED_VERSION_IMMUTABLE',
  'INVALID_WORKSTREAM_TRANSITION',
  'WORKSTREAM_ARCHIVED',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_VERSION_NOT_FOUND',
  'WORKFLOW_VERSION_NOT_SELECTABLE',
  'WORKFLOW_VERSION_REVOKED',
  'WORKSTREAM_DEPENDENCY_NOT_FOUND',
  'WORKSTREAM_DEPENDENCY_CROSS_CAMPAIGN',
  'WORKSTREAM_SELF_DEPENDENCY',
  'WORKSTREAM_DEPENDENCY_ALREADY_EXISTS',
  'WORKSTREAM_DEPENDENCY_CYCLE',
  'WORKSTREAM_DEPENDENCY_LIMIT_REACHED',
  'WORKSTREAM_HAS_DEPENDENTS',
]);
export type WorkstreamManagementErrorCode = z.infer<
  typeof WorkstreamManagementErrorCodeSchema
>;
