import { z } from 'zod';

import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  CampaignIdSchema,
  CauseIdSchema,
  ExecutorIdSchema,
  JobIdSchema,
  LeaseIdSchema,
  MessageIdSchema,
  OpportunityIdSchema,
  NodeIdSchema,
  RunIdSchema,
  UserIdSchema,
  WorkflowIdSchema,
  WorkflowVersionIdSchema,
  WorkstreamIdSchema,
} from './identifiers.js';
import {
  CapacityClassSchema,
  ExecutorTypeSchema,
  JobPrioritySchema,
} from './job-management.js';
import { WorkflowVersionRequirementsSchema } from './agent-task.js';
import { ArtifactAttachmentsSchema } from './artifact-attachments.js';
import { JsonValueSchema, Sha256Schema } from './workflow-data.js';

export { CapacityClassSchema, ExecutorTypeSchema } from './job-management.js';
export type { CapacityClass, ExecutorType } from './job-management.js';

export const PROTOCOL_VERSION = 1 as const;
export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;

const VersionedObjectSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
});

export const TimestampSchema = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof TimestampSchema>;
const NonEmptyStringSchema = z.string().trim().min(1);

export const JobStatusSchema = z.enum([
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
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const CampaignStatusSchema = z.enum([
  'draft',
  'ready',
  'active',
  'paused',
  'exhausted',
  'completed',
  'closed',
  'cancelled',
  'archived',
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CauseSchema = VersionedObjectSchema.extend({
  id: CauseIdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  operatorName: NonEmptyStringSchema,
  reviewPolicy: NonEmptyStringSchema,
}).strict();
export type Cause = z.infer<typeof CauseSchema>;

export const WorkflowReferenceSchema = VersionedObjectSchema.extend({
  id: WorkflowVersionIdSchema,
  workflowFamilyId: WorkflowIdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  inputSchemaHash: Sha256Schema,
  outputSchemaHash: Sha256Schema,
  definitionHash: Sha256Schema,
  packageHash: Sha256Schema,
}).strict();
export type WorkflowReference = z.infer<typeof WorkflowReferenceSchema>;

export const AvailabilityPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('always') }).strict(),
  z.object({ type: z.literal('manual_activation') }).strict(),
  z
    .object({ type: z.literal('scheduled'), schedule: NonEmptyStringSchema })
    .strict(),
  z
    .object({
      type: z.literal('time_window'),
      startsAt: TimestampSchema,
      endsAt: TimestampSchema,
    })
    .strict(),
  z.object({ type: z.literal('until_target_reached') }).strict(),
  z
    .object({
      type: z.literal('source_triggered'),
      sourceId: NonEmptyStringSchema,
    })
    .strict(),
]);
export type AvailabilityPolicy = z.infer<typeof AvailabilityPolicySchema>;

export const InventoryPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pre_generated') }).strict(),
  z
    .object({
      type: z.literal('generated_from_dataset'),
      sourceId: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('lazy'),
      maximumInstances: z.number().int().positive().optional(),
    })
    .strict(),
  z.object({ type: z.literal('reusable') }).strict(),
]);
export type InventoryPolicy = z.infer<typeof InventoryPolicySchema>;

export const ParticipationPolicySchema = z
  .object({
    maxAttemptsPerContributor: z.number().int().positive().optional(),
    maxCompletionsPerContributor: z.number().int().positive().optional(),
    maxAcceptedRunsPerContributor: z.number().int().positive().optional(),
    maxRunsPerContributorPerInstance: z.number().int().positive().optional(),
    minimumMembershipAgeHours: z.number().int().nonnegative().optional(),
    allowedContributorGroups: z.array(NonEmptyStringSchema).min(1).optional(),
    requiredCapabilities: z.array(NonEmptyStringSchema).min(1).optional(),
  })
  .strict();
export type ParticipationPolicy = z.infer<typeof ParticipationPolicySchema>;

export const CompletionPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_instances_completed') }).strict(),
  z
    .object({
      type: z.literal('accepted_run_target'),
      count: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('accepted_runs_per_instance'),
      count: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('until_date'), endsAt: TimestampSchema }).strict(),
  z.object({ type: z.literal('manual_close') }).strict(),
  z.object({ type: z.literal('continuous') }).strict(),
]);
export type CompletionPolicy = z.infer<typeof CompletionPolicySchema>;

export const CampaignValidationPolicySchema = z
  .object({
    requiredAcceptedRunsPerInstance: z.number().int().positive(),
    maxConcurrentRunsPerInstance: z.number().int().positive(),
    disagreementReviewRequired: z.boolean(),
  })
  .strict();
export type CampaignValidationPolicy = z.infer<
  typeof CampaignValidationPolicySchema
>;

export const CampaignSchema = VersionedObjectSchema.extend({
  messageType: z.literal('campaign.definition'),
  id: CampaignIdSchema,
  causeId: CauseIdSchema,
  name: NonEmptyStringSchema,
  workflow: WorkflowReferenceSchema,
  status: CampaignStatusSchema,
  availabilityPolicy: AvailabilityPolicySchema,
  inventoryPolicy: InventoryPolicySchema,
  participationPolicy: ParticipationPolicySchema,
  completionPolicy: CompletionPolicySchema,
  validationPolicy: CampaignValidationPolicySchema,
  inputArtifactIds: z.array(ArtifactIdSchema),
  createdByUserId: UserIdSchema,
  createdAt: TimestampSchema,
  activatedAt: TimestampSchema.optional(),
}).strict();
export type Campaign = z.infer<typeof CampaignSchema>;

export const JobDefinitionSchema = VersionedObjectSchema.extend({
  messageType: z.literal('job.definition'),
  id: JobIdSchema,
  campaignId: CampaignIdSchema,
  workstreamId: WorkstreamIdSchema,
  causeId: CauseIdSchema,
  workflow: WorkflowReferenceSchema,
  workflowRequirements: WorkflowVersionRequirementsSchema,
  status: JobStatusSchema,
  objective: NonEmptyStringSchema,
  input: JsonValueSchema,
  requiredAcceptedRuns: z.number().int().positive(),
  acceptedRunCount: z.number().int().nonnegative(),
  capacityClass: CapacityClassSchema,
  estimatedDurationMinutes: z.number().int().positive(),
  supportedExecutorTypes: z.array(ExecutorTypeSchema).min(1),
  requiresPersistentRunner: z.boolean(),
  requiresCheckpointRecovery: z.boolean(),
  createdAt: TimestampSchema,
}).strict();
export type JobDefinition = z.infer<typeof JobDefinitionSchema>;

export const ContributorWorkflowProjectionSchema = z
  .object({
    reference: WorkflowReferenceSchema,
    requirements: WorkflowVersionRequirementsSchema,
  })
  .strict();
export type ContributorWorkflowProjection = z.infer<
  typeof ContributorWorkflowProjectionSchema
>;

const OpportunityContextSchema = z
  .object({
    id: z.string().trim().min(1),
    name: NonEmptyStringSchema,
  })
  .strict();

export const ContributionOpportunitySummarySchema = z
  .object({
    id: OpportunityIdSchema,
    cause: OpportunityContextSchema.extend({ id: CauseIdSchema }).strict(),
    campaign: OpportunityContextSchema.extend({ id: CampaignIdSchema })
      .extend({
        objective: NonEmptyStringSchema,
      })
      .strict(),
    workstream: OpportunityContextSchema.extend({
      id: WorkstreamIdSchema,
    }).strict(),
    title: NonEmptyStringSchema,
    summary: NonEmptyStringSchema.optional(),
    objective: NonEmptyStringSchema.optional(),
    workflow: ContributorWorkflowProjectionSchema,
    requiredAcceptedRuns: z.number().int().positive(),
    priority: JobPrioritySchema,
    estimatedDurationMinutes: z.number().int().positive(),
    capacityClass: CapacityClassSchema.optional(),
    supportedExecutorTypes: z.array(ExecutorTypeSchema).min(1),
    requiresPersistentRunner: z.boolean(),
    requiresCheckpointRecovery: z.boolean(),
    availableFrom: z.number().finite().optional(),
    availableUntil: z.number().finite().optional(),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
  })
  .strict();
export type ContributionOpportunitySummary = z.infer<
  typeof ContributionOpportunitySummarySchema
>;

export const ContributionOpportunityDetailSchema =
  ContributionOpportunitySummarySchema.extend({
    input: JsonValueSchema,
    validationParameters: JsonValueSchema.optional(),
  }).strict();
export type ContributionOpportunityDetail = z.infer<
  typeof ContributionOpportunityDetailSchema
>;
export const ContributionOpportunitySchema =
  ContributionOpportunityDetailSchema;
export type ContributionOpportunity = ContributionOpportunityDetail;

export const ClaimOpportunityRequestSchema = z
  .object({
    opportunityId: OpportunityIdSchema,
    leaseId: LeaseIdSchema,
    runId: RunIdSchema,
    nodeId: NodeIdSchema,
    executorId: ExecutorIdSchema,
    contributorId: UserIdSchema,
    executorType: ExecutorTypeSchema,
    durationMs: z.number().int().positive(),
  })
  .strict();
export type ClaimOpportunityRequest = z.infer<
  typeof ClaimOpportunityRequestSchema
>;

export const JobLeaseSchema = VersionedObjectSchema.extend({
  messageType: z.literal('job.lease'),
  messageId: MessageIdSchema,
  id: LeaseIdSchema,
  jobId: JobIdSchema,
  runId: RunIdSchema,
  executorId: ExecutorIdSchema,
  contributorId: UserIdSchema,
  executorType: ExecutorTypeSchema,
  status: z.enum(['active', 'released', 'expired']),
  leasedAt: TimestampSchema,
  expiresAt: TimestampSchema,
}).strict();
export type JobLease = z.infer<typeof JobLeaseSchema>;

export const ClaimedContributionSchema = z
  .object({
    opportunityId: OpportunityIdSchema,
    job: JobDefinitionSchema,
    lease: JobLeaseSchema,
  })
  .strict()
  .superRefine(({ job, lease }, context) => {
    if (lease.jobId !== job.id) {
      context.addIssue({
        code: 'custom',
        path: ['lease', 'jobId'],
        message: 'Claim lease must belong to the materialized job',
      });
    }
  });
export type ClaimedContribution = z.infer<typeof ClaimedContributionSchema>;

const JobProgressBaseSchema = VersionedObjectSchema.extend({
  messageType: z.literal('job.progress'),
  messageId: MessageIdSchema,
  jobId: JobIdSchema,
  runId: RunIdSchema,
  sequence: z.number().int().nonnegative(),
  occurredAt: TimestampSchema,
});

export const JobProgressEventSchema = z.discriminatedUnion('eventType', [
  JobProgressBaseSchema.extend({
    eventType: z.literal('phase.changed'),
    status: JobStatusSchema,
  }).strict(),
  JobProgressBaseSchema.extend({
    eventType: z.literal('progress.reported'),
    message: NonEmptyStringSchema,
    percentage: z.number().min(0).max(100).optional(),
  }).strict(),
  JobProgressBaseSchema.extend({
    eventType: z.literal('approval.requested'),
    approvalId: ApprovalIdSchema,
  }).strict(),
  JobProgressBaseSchema.extend({
    eventType: z.literal('artifact.submitted'),
    artifactId: ArtifactIdSchema,
  }).strict(),
  JobProgressBaseSchema.extend({
    eventType: z.literal('run.completed'),
    artifactId: ArtifactIdSchema,
  }).strict(),
  JobProgressBaseSchema.extend({
    eventType: z.literal('run.failed'),
    failure: z.discriminatedUnion('retryable', [
      z
        .object({
          retryable: z.literal(true),
          code: NonEmptyStringSchema,
          message: NonEmptyStringSchema,
        })
        .strict(),
      z
        .object({
          retryable: z.literal(false),
          code: NonEmptyStringSchema,
          message: NonEmptyStringSchema,
        })
        .strict(),
    ]),
  }).strict(),
]);
export type JobProgressEvent = z.infer<typeof JobProgressEventSchema>;

export const ApprovalRequestSchema = VersionedObjectSchema.extend({
  messageType: z.literal('approval.request'),
  messageId: MessageIdSchema,
  id: ApprovalIdSchema,
  jobId: JobIdSchema,
  runId: RunIdSchema,
  approvalType: z.enum(['artifact_submission', 'network_access']),
  reason: NonEmptyStringSchema,
  requestedAt: TimestampSchema,
  expiresAt: TimestampSchema,
}).strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

const ApprovalDecisionBaseSchema = VersionedObjectSchema.extend({
  messageType: z.literal('approval.decision'),
  messageId: MessageIdSchema,
  approvalId: ApprovalIdSchema,
  decidedAt: TimestampSchema,
});

export const ApprovalDecisionSchema = z.discriminatedUnion('decision', [
  ApprovalDecisionBaseSchema.extend({
    decision: z.literal('approved'),
  }).strict(),
  ApprovalDecisionBaseSchema.extend({
    decision: z.literal('denied'),
    reason: NonEmptyStringSchema,
  }).strict(),
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ArtifactManifestSchema = VersionedObjectSchema.extend({
  messageType: z.literal('artifact.submission'),
  messageId: MessageIdSchema,
  id: ArtifactIdSchema,
  jobId: JobIdSchema,
  runId: RunIdSchema,
  workflowVersionId: WorkflowVersionIdSchema,
  outputSchemaHash: Sha256Schema,
  mediaType: z.literal('application/json'),
  contentHash: Sha256Schema,
  content: JsonValueSchema,
  attachments: ArtifactAttachmentsSchema.optional(),
  createdAt: TimestampSchema,
}).strict();
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;

export const ProtocolMessageSchema = z.discriminatedUnion('messageType', [
  CampaignSchema,
  JobDefinitionSchema,
  JobLeaseSchema,
  JobProgressEventSchema,
  ApprovalRequestSchema,
  ApprovalDecisionSchema,
  ArtifactManifestSchema,
]);
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;

// Runtime adapters consume the same provider-neutral normalized event contract.
export const RuntimeEventSchema = JobProgressEventSchema;
export type RuntimeEvent = JobProgressEvent;
