import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  ExecutableWorkflowDefinitionSchema,
  JobDefinitionSchema,
  JsonValueSchema,
  RunIdSchema,
  ValidationRunIdSchema,
  WorkflowValidationInputSchema,
  WorkflowValidationResultSchema,
  WorkflowValidationTaskDefinitionSchema,
} from '@causaic/protocol';
import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);

export const RuntimeInstallationIdSchema = z
  .string()
  .regex(/^runtime-installation_[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .brand<'RuntimeInstallationId'>();
export type RuntimeInstallationId = z.infer<typeof RuntimeInstallationIdSchema>;

export const RuntimeSessionIdSchema = z
  .string()
  .regex(/^runtime-session_[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .brand<'RuntimeSessionId'>();
export type RuntimeSessionId = z.infer<typeof RuntimeSessionIdSchema>;

export const RuntimeInstallationSchema = z
  .object({
    id: RuntimeInstallationIdSchema,
    runtimeType: NonEmptyStringSchema,
    displayName: NonEmptyStringSchema,
    version: NonEmptyStringSchema,
    available: z.boolean(),
  })
  .strict();
export type RuntimeInstallation = z.infer<typeof RuntimeInstallationSchema>;

export const RuntimeSessionContextSchema = z
  .object({
    sessionId: RuntimeSessionIdSchema,
    installationId: RuntimeInstallationIdSchema,
    job: JobDefinitionSchema,
    workflowDefinition: ExecutableWorkflowDefinitionSchema,
    runId: RunIdSchema,
    approvalId: ApprovalIdSchema,
    artifactId: ArtifactIdSchema,
  })
  .strict();
export type RuntimeSessionContext = z.infer<typeof RuntimeSessionContextSchema>;

export const PreparedSessionSchema = RuntimeSessionContextSchema.extend({
  runtimeType: NonEmptyStringSchema,
}).strict();
export type PreparedSession = z.infer<typeof PreparedSessionSchema>;

export const RuntimeApprovalRequestSchema = z
  .object({
    id: ApprovalIdSchema,
    type: z.literal('network_access'),
    domain: z.literal('example.gov'),
    reason: NonEmptyStringSchema,
  })
  .strict();
export type RuntimeApprovalRequest = z.infer<
  typeof RuntimeApprovalRequestSchema
>;

const RuntimeApprovalDecisionBaseSchema = z.object({
  approvalId: ApprovalIdSchema,
});

export const ApprovalDecisionSchema = z.discriminatedUnion('decision', [
  RuntimeApprovalDecisionBaseSchema.extend({
    decision: z.literal('approved'),
  }).strict(),
  RuntimeApprovalDecisionBaseSchema.extend({
    decision: z.literal('denied'),
    reason: NonEmptyStringSchema,
  }).strict(),
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const RuntimeFailureSchema = z
  .object({
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    retryable: z.boolean(),
  })
  .strict();
export type RuntimeFailure = z.infer<typeof RuntimeFailureSchema>;

const RuntimeEventBaseSchema = z.object({
  sessionId: RuntimeSessionIdSchema,
  sequence: z.number().int().nonnegative(),
});

export const RuntimeEventSchema = z.discriminatedUnion('type', [
  RuntimeEventBaseSchema.extend({
    type: z.literal('session.started'),
    installationId: RuntimeInstallationIdSchema,
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('phase.changed'),
    phase: z.enum(['preparing', 'verifying']),
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('progress'),
    message: NonEmptyStringSchema,
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('approval.requested'),
    request: RuntimeApprovalRequestSchema,
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('artifact.created'),
    artifactId: ArtifactIdSchema,
    artifact: JsonValueSchema,
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('session.completed'),
    artifactId: ArtifactIdSchema,
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('session.failed'),
    failure: RuntimeFailureSchema,
  }).strict(),
  RuntimeEventBaseSchema.extend({
    type: z.literal('session.cancelled'),
    reason: NonEmptyStringSchema,
  }).strict(),
]);
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export const ValidationRuntimeSessionContextSchema = z
  .object({
    sessionId: RuntimeSessionIdSchema,
    installationId: RuntimeInstallationIdSchema,
    validationRunId: ValidationRunIdSchema,
    task: WorkflowValidationTaskDefinitionSchema,
    input: WorkflowValidationInputSchema,
  })
  .strict();
export type ValidationRuntimeSessionContext = z.infer<
  typeof ValidationRuntimeSessionContextSchema
>;

export const PreparedValidationSessionSchema =
  ValidationRuntimeSessionContextSchema.extend({
    runtimeType: NonEmptyStringSchema,
  }).strict();
export type PreparedValidationSession = z.infer<
  typeof PreparedValidationSessionSchema
>;

const ValidationRuntimeEventBaseSchema = z.object({
  sessionId: RuntimeSessionIdSchema,
  sequence: z.number().int().nonnegative(),
});
export const ValidationRuntimeEventSchema = z.discriminatedUnion('type', [
  ValidationRuntimeEventBaseSchema.extend({
    type: z.literal('validation.started'),
    installationId: RuntimeInstallationIdSchema,
  }).strict(),
  ValidationRuntimeEventBaseSchema.extend({
    type: z.literal('validation.progress'),
    message: NonEmptyStringSchema,
  }).strict(),
  ValidationRuntimeEventBaseSchema.extend({
    type: z.literal('validation.completed'),
    result: WorkflowValidationResultSchema,
  }).strict(),
  ValidationRuntimeEventBaseSchema.extend({
    type: z.literal('validation.failed'),
    failure: RuntimeFailureSchema,
  }).strict(),
  ValidationRuntimeEventBaseSchema.extend({
    type: z.literal('validation.cancelled'),
    reason: NonEmptyStringSchema,
  }).strict(),
]);
export type ValidationRuntimeEvent = z.infer<
  typeof ValidationRuntimeEventSchema
>;
