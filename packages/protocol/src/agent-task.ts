import { z } from 'zod';

import {
  ArtifactDecisionIdSchema,
  ArtifactIdSchema,
  CauseIdSchema,
  ConsentIdSchema,
  ExecutorIdSchema,
  JobIdSchema,
  ValidationRunIdSchema,
  WorkflowIdSchema,
  WorkflowVersionIdSchema,
} from './identifiers.js';
import {
  JsonValueSchema,
  Sha256Schema,
  WorkflowSchemaDescriptorSchema,
  WorkflowSchemaDocumentSchema,
} from './workflow-data.js';
import { ArtifactAttachmentsSchema } from './artifact-attachments.js';

const MarkdownSchema = z.string().trim().min(1).max(20_000);
const ShortMarkdownSchema = z.string().trim().min(1).max(2_000);
const OptionalMarkdownSchema = z
  .string()
  .trim()
  .max(20_000)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const WorkflowInstructionsSchema = z
  .object({
    objective: ShortMarkdownSchema,
    procedure: MarkdownSchema,
    constraints: z.array(ShortMarkdownSchema).max(32),
    completionCriteria: z.array(ShortMarkdownSchema).max(32),
    outputInstructions: OptionalMarkdownSchema,
  })
  .strict();
export type WorkflowInstructions = z.infer<typeof WorkflowInstructionsSchema>;

export const WorkflowExecutionModeSchema = z
  .object({
    type: z.literal('managed_agent'),
    runtimeTypes: z.array(z.literal('fake')).min(1).max(1),
  })
  .strict();

const CapabilityIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);

const OptionalCapabilityDescriptionSchema = z
  .string()
  .trim()
  .max(280)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const OptionalProviderReferenceSchema = z
  .string()
  .trim()
  .max(2_000)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const SuggestedProviderSchema = z
  .object({
    kind: z.enum(['mcp', 'plugin', 'connector']),
    name: z.string().trim().min(1).max(128),
    description: OptionalCapabilityDescriptionSchema,
    reference: OptionalProviderReferenceSchema,
  })
  .strict();
export type SuggestedProvider = z.infer<typeof SuggestedProviderSchema>;

export const CapabilityHintSchema = z
  .object({
    capability: CapabilityIdentifierSchema,
    level: z.enum(['required', 'recommended']),
    description: OptionalCapabilityDescriptionSchema,
    suggestedProviders: z.array(SuggestedProviderSchema).max(8).optional(),
  })
  .strict();
export type CapabilityHint = z.infer<typeof CapabilityHintSchema>;

export const WorkflowExecutionExampleSchema = z
  .object({
    input: JsonValueSchema,
    output: JsonValueSchema.optional(),
  })
  .strict();
export type WorkflowExecutionExample = z.infer<
  typeof WorkflowExecutionExampleSchema
>;

export const AgentTaskDefinitionSchema = z
  .object({
    instructions: WorkflowInstructionsSchema,
    capabilityHints: z.array(CapabilityHintSchema).max(16),
    examples: z.array(WorkflowExecutionExampleSchema).max(3),
    supportedExecutionModes: z.array(WorkflowExecutionModeSchema).max(1),
  })
  .strict();
export type AgentTaskDefinition = z.infer<typeof AgentTaskDefinitionSchema>;

export const WorkflowValidationDecisionSchema = z.enum([
  'accept',
  'reject',
  'needs_review',
]);
export type WorkflowValidationDecision = z.infer<
  typeof WorkflowValidationDecisionSchema
>;
export const WorkflowValidationPolicySchema = z.enum([
  'advisory',
  'human_confirmation',
  'automatic',
]);
export type WorkflowValidationPolicy = z.infer<
  typeof WorkflowValidationPolicySchema
>;

export const WorkflowValidationIssueTargetSchema = z.enum([
  'artifact',
  'job_input',
  'validation_parameters',
  'general',
]);
export type WorkflowValidationIssueTarget = z.infer<
  typeof WorkflowValidationIssueTargetSchema
>;

/** RFC 6901 JSON Pointer, relative to the issue's declared target. */
export const JsonPointerSchema = z
  .string()
  .max(1_024)
  .regex(/^(?:|(?:\/(?:[^~]|~[01])*))*$/);

export const WorkflowValidationIssueCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_]{0,127}$/);

export const WorkflowValidationIssueCodeDefinitionSchema = z
  .object({
    code: WorkflowValidationIssueCodeSchema,
    description: z.string().trim().min(1).max(280),
  })
  .strict();
export type WorkflowValidationIssueCodeDefinition = z.infer<
  typeof WorkflowValidationIssueCodeDefinitionSchema
>;

export const WorkflowValidationIssueSchema = z
  .object({
    severity: z.enum(['warning', 'error']),
    target: WorkflowValidationIssueTargetSchema,
    instancePath: JsonPointerSchema.optional(),
    code: WorkflowValidationIssueCodeSchema.optional(),
    message: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((issue, context) => {
    if (issue.target === 'general' && issue.instancePath !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['instancePath'],
        message: 'General issues cannot include an instance path.',
      });
    }
  });
export type WorkflowValidationIssue = z.infer<
  typeof WorkflowValidationIssueSchema
>;

export const WorkflowValidationResultSchema = z
  .object({
    decision: WorkflowValidationDecisionSchema,
    summary: z.string().trim().min(1).max(2_000),
    issues: z.array(WorkflowValidationIssueSchema).max(50),
    details: JsonValueSchema.optional(),
  })
  .strict();
export type WorkflowValidationResult = z.infer<
  typeof WorkflowValidationResultSchema
>;

export const WorkflowValidationExampleInputSchema = z
  .object({
    jobInput: JsonValueSchema,
    artifactContent: JsonValueSchema,
    parameters: JsonValueSchema.nullable(),
  })
  .strict();
export type WorkflowValidationExampleInput = z.infer<
  typeof WorkflowValidationExampleInputSchema
>;

export const WorkflowValidationExampleSchema = z
  .object({
    input: WorkflowValidationExampleInputSchema.optional(),
    result: WorkflowValidationResultSchema,
  })
  .strict();
export type WorkflowValidationExample = z.infer<
  typeof WorkflowValidationExampleSchema
>;

export const WorkflowValidationTaskDefinitionSchema = z
  .object({
    instructions: WorkflowInstructionsSchema,
    capabilityHints: z.array(CapabilityHintSchema).max(16),
    examples: z.array(WorkflowValidationExampleSchema).max(3),
  })
  .strict();
export type WorkflowValidationTaskDefinition = z.infer<
  typeof WorkflowValidationTaskDefinitionSchema
>;

export const WorkflowExecutionRequirementsSchema =
  AgentTaskDefinitionSchema.pick({
    capabilityHints: true,
  }).strict();
export type WorkflowExecutionRequirements = z.infer<
  typeof WorkflowExecutionRequirementsSchema
>;

export const WorkflowValidationRequirementsSchema =
  WorkflowValidationTaskDefinitionSchema.pick({
    capabilityHints: true,
  }).strict();
export type WorkflowValidationRequirements = z.infer<
  typeof WorkflowValidationRequirementsSchema
>;

export const WorkflowVersionRequirementsSchema = z
  .object({
    execution: WorkflowExecutionRequirementsSchema,
    validation: WorkflowValidationRequirementsSchema.optional(),
  })
  .strict();
export type WorkflowVersionRequirements = z.infer<
  typeof WorkflowVersionRequirementsSchema
>;

/**
 * Adds the immutable workflow version's optional issue-code vocabulary to the
 * result boundary. The base result schema remains useful for definitions that
 * do not declare a vocabulary.
 */
export function workflowValidationResultSchemaFor(
  issueCodes: readonly WorkflowValidationIssueCodeDefinition[] | undefined,
) {
  const allowedCodes =
    issueCodes === undefined
      ? undefined
      : new Set(issueCodes.map((definition) => definition.code));
  return WorkflowValidationResultSchema.superRefine((result, context) => {
    if (allowedCodes === undefined) return;
    result.issues.forEach((issue, index) => {
      if (issue.code !== undefined && !allowedCodes.has(issue.code)) {
        context.addIssue({
          code: 'custom',
          path: ['issues', index, 'code'],
          message: `Issue code "${issue.code}" is not declared by the workflow validation definition.`,
        });
      }
    });
  });
}

export function parseWorkflowValidationResult(
  value: unknown,
  issueCodes: readonly WorkflowValidationIssueCodeDefinition[] | undefined,
): WorkflowValidationResult {
  return workflowValidationResultSchemaFor(issueCodes).parse(value);
}

export const WorkflowValidationDefinitionSchema = z
  .object({
    policy: WorkflowValidationPolicySchema,
    task: WorkflowValidationTaskDefinitionSchema,
    parametersSchema: WorkflowSchemaDescriptorSchema.optional(),
    detailsSchema: WorkflowSchemaDescriptorSchema.optional(),
    issueCodes: z
      .array(WorkflowValidationIssueCodeDefinitionSchema)
      .max(64)
      .optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    if (definition.issueCodes === undefined) return;
    const seen = new Set<string>();
    const allowedCodes = new Set(
      definition.issueCodes.map((issueCode) => issueCode.code),
    );
    definition.issueCodes.forEach((issueCode, index) => {
      if (seen.has(issueCode.code)) {
        context.addIssue({
          code: 'custom',
          path: ['issueCodes', index, 'code'],
          message: `Issue code "${issueCode.code}" is declared more than once.`,
        });
      }
      seen.add(issueCode.code);
    });
    definition.task.examples.forEach((example, exampleIndex) => {
      example.result.issues.forEach((issue, issueIndex) => {
        if (issue.code !== undefined && !allowedCodes.has(issue.code)) {
          context.addIssue({
            code: 'custom',
            path: [
              'task',
              'examples',
              exampleIndex,
              'result',
              'issues',
              issueIndex,
              'code',
            ],
            message: `Issue code "${issue.code}" is not declared by the workflow validation definition.`,
          });
        }
      });
    });
  });
export type WorkflowValidationDefinition = z.infer<
  typeof WorkflowValidationDefinitionSchema
>;

export const ExecutableWorkflowDefinitionSchema = z
  .object({
    workflowFamilyId: WorkflowIdSchema,
    workflowVersionId: WorkflowVersionIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    definitionHash: Sha256Schema,
    packageHash: Sha256Schema,
    execution: AgentTaskDefinitionSchema.extend({
      inputSchema: WorkflowSchemaDocumentSchema,
      outputSchema: WorkflowSchemaDocumentSchema,
    }).strict(),
    validation: WorkflowValidationDefinitionSchema.optional(),
  })
  .strict();
export type ExecutableWorkflowDefinition = z.infer<
  typeof ExecutableWorkflowDefinitionSchema
>;

export const WorkflowValidationInputSchema = z
  .object({
    job: z.object({ id: JobIdSchema, input: JsonValueSchema }).strict(),
    artifact: z
      .object({
        id: ArtifactIdSchema,
        content: JsonValueSchema,
        contentHash: Sha256Schema,
        attachments: ArtifactAttachmentsSchema.optional(),
      })
      .strict(),
    parameters: JsonValueSchema.nullable(),
  })
  .strict();
export type WorkflowValidationInput = z.infer<
  typeof WorkflowValidationInputSchema
>;

export const WorkflowValidationSessionSchema = z
  .object({
    validationRunId: ValidationRunIdSchema,
    definitionHash: Sha256Schema,
    task: WorkflowValidationTaskDefinitionSchema,
    policy: WorkflowValidationPolicySchema,
    issueCodes: z
      .array(WorkflowValidationIssueCodeDefinitionSchema)
      .max(64)
      .optional(),
    detailsSchema: WorkflowSchemaDocumentSchema.optional(),
    input: WorkflowValidationInputSchema,
  })
  .strict();
export type WorkflowValidationSession = z.infer<
  typeof WorkflowValidationSessionSchema
>;

export const ValidationRunStatusSchema = z.enum([
  'preparing',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type ValidationRunStatus = z.infer<typeof ValidationRunStatusSchema>;

export const ValidationRunOriginSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('operator_mcp'), executorId: ExecutorIdSchema })
    .strict(),
  z.object({ type: z.literal('test_harness') }).strict(),
]);
export type ValidationRunOrigin = z.infer<typeof ValidationRunOriginSchema>;

export const WorkflowValidationDecisionSourceSchema = z.enum([
  'schema_only',
  'agent_automatic',
  'operator',
]);
export type WorkflowValidationDecisionSource = z.infer<
  typeof WorkflowValidationDecisionSourceSchema
>;

export const WorkflowValidationDecisionProjectionSchema = z
  .object({
    id: ArtifactDecisionIdSchema,
    decision: z.enum(['accept', 'reject']),
    source: WorkflowValidationDecisionSourceSchema,
    recommendation: WorkflowValidationResultSchema.optional(),
    rationale: z.string().optional(),
    decidedAt: z.number().finite(),
  })
  .strict();
export type WorkflowValidationDecisionProjection = z.infer<
  typeof WorkflowValidationDecisionProjectionSchema
>;

export const WorkflowValidationAllowedActionsSchema = z
  .object({
    start: z.boolean(),
    submitResult: z.boolean(),
    cancel: z.boolean(),
    prepareDecision: z.boolean(),
    decide: z.boolean(),
  })
  .strict();
export type WorkflowValidationAllowedActions = z.infer<
  typeof WorkflowValidationAllowedActionsSchema
>;

export const WorkflowValidationConsentStatusSchema = z.enum([
  'pending',
  'approved',
  'denied',
  'consumed',
  'expired',
]);
export type WorkflowValidationConsentStatus = z.infer<
  typeof WorkflowValidationConsentStatusSchema
>;

export const WorkflowValidationConsentActionSchema = z
  .object({
    type: z.literal('artifact_decision'),
    causeId: CauseIdSchema,
    artifactId: ArtifactIdSchema,
    workflowVersionId: WorkflowVersionIdSchema,
    artifactContentHash: Sha256Schema,
    validationDefinitionHash: Sha256Schema.optional(),
    policy: WorkflowValidationPolicySchema,
    validationRunId: ValidationRunIdSchema.optional(),
    recommendation: WorkflowValidationResultSchema.optional(),
    decision: z.enum(['accept', 'reject']),
    rationale: z.string().trim().min(1).max(2_000),
  })
  .strict();
export type WorkflowValidationConsentAction = z.infer<
  typeof WorkflowValidationConsentActionSchema
>;

export const WorkflowValidationConsentSchema = z
  .object({
    id: ConsentIdSchema,
    status: WorkflowValidationConsentStatusSchema,
    proposedAction: WorkflowValidationConsentActionSchema,
    actionHash: Sha256Schema,
    createdAt: z.number().finite(),
    expiresAt: z.number().finite(),
    resolvedAt: z.number().finite().optional(),
    consumedAt: z.number().finite().optional(),
    denialReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type WorkflowValidationConsent = z.infer<
  typeof WorkflowValidationConsentSchema
>;

export const WorkflowValidationErrorCodeSchema = z.enum([
  'WORKFLOW_VALIDATION_UNAVAILABLE',
  'VALIDATION_POLICY_ACTION_INVALID',
  'VALIDATION_RUN_ALREADY_ACTIVE',
  'VALIDATION_CONTENT_STALE',
  'VALIDATION_PERMISSION_DENIED',
  'VALIDATION_CONSENT_REQUIRED',
  'VALIDATION_DECISION_TERMINAL',
  'VALIDATION_RESULT_REQUIRED',
  'VALIDATION_ARTIFACT_NOT_STRUCTURALLY_VALID',
]);
export type WorkflowValidationErrorCode = z.infer<
  typeof WorkflowValidationErrorCodeSchema
>;

export const ValidationRunSummarySchema = z
  .object({
    id: ValidationRunIdSchema,
    status: ValidationRunStatusSchema,
    origin: ValidationRunOriginSchema,
    definitionHash: Sha256Schema,
    result: WorkflowValidationResultSchema.optional(),
    startedAt: z.number(),
    completedAt: z.number().optional(),
    failureMessage: z.string().optional(),
  })
  .strict();
export type ValidationRunSummary = z.infer<typeof ValidationRunSummarySchema>;
