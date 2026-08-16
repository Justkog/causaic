import { z } from 'zod';

import {
  CauseIdSchema,
  UserIdSchema,
  WorkflowIdSchema,
  WorkflowVersionIdSchema,
} from './identifiers.js';
import {
  CauseMembershipRoleSchema,
  CauseSlugSchema,
} from './cause-management.js';
import {
  WorkflowSchemaDescriptorSchema,
  WorkflowSchemaDocumentSchema,
  Sha256Schema,
} from './workflow-data.js';
import {
  AgentTaskDefinitionSchema,
  WorkflowInstructionsSchema,
  WorkflowValidationDefinitionSchema,
  WorkflowValidationIssueCodeDefinitionSchema,
  WorkflowValidationPolicySchema,
  CapabilityHintSchema,
} from './agent-task.js';
import {
  WorkflowStatusSchema,
  WorkflowVersionStatusSchema,
} from './workflow-catalog.js';

export const WorkflowScopeSchema = z.enum(['platform', 'cause_private']);
export type WorkflowScope = z.infer<typeof WorkflowScopeSchema>;

export const PrivateWorkflowProfileInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: CauseSlugSchema,
    summary: z.string().trim().min(10).max(280),
    description: z.string().trim().min(1).max(10_000),
  })
  .strict();
export type PrivateWorkflowProfileInput = z.input<
  typeof PrivateWorkflowProfileInputSchema
>;
export type NormalizedPrivateWorkflowProfileInput = z.output<
  typeof PrivateWorkflowProfileInputSchema
>;

export const SemanticVersionSchema = z
  .string()
  .trim()
  .regex(/^\d+\.\d+\.\d+$/);
export type SemanticVersion = z.infer<typeof SemanticVersionSchema>;

export interface SemanticVersionParts {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemanticVersion(
  value: string,
): SemanticVersionParts | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (match === null) return undefined;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return undefined;
  const [major, minor, patch] = parts;
  if (major === undefined || minor === undefined || patch === undefined)
    return undefined;
  return { major, minor, patch };
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftParts = parseSemanticVersion(left);
  const rightParts = parseSemanticVersion(right);
  if (leftParts === undefined || rightParts === undefined)
    throw new Error('Cannot compare invalid semantic versions.');
  return (
    leftParts.major - rightParts.major ||
    leftParts.minor - rightParts.minor ||
    leftParts.patch - rightParts.patch
  );
}

export function incrementSemanticVersionPatch(value: string): string {
  const parts = parseSemanticVersion(value);
  if (parts === undefined) throw new Error('Cannot increment invalid version.');
  return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
}

const optionalSchemaSummarySchema = z
  .string()
  .trim()
  .max(280)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const PrivateWorkflowVersionInputSchema = z
  .object({
    version: SemanticVersionSchema,
    summary: z.string().trim().min(1).max(280),
    inputSchemaSummary: optionalSchemaSummarySchema,
    outputSchemaSummary: optionalSchemaSummarySchema,
    inputSchemaJson: z
      .string()
      .trim()
      .min(1)
      .max(64 * 1024),
    outputSchemaJson: z
      .string()
      .trim()
      .min(1)
      .max(64 * 1024),
    instructions: WorkflowInstructionsSchema,
    capabilityHints: z.array(CapabilityHintSchema).max(16),
    executionExamplesJson: z
      .string()
      .trim()
      .max(64 * 1024),
    validationEnabled: z.boolean(),
    validationPolicy: WorkflowValidationPolicySchema,
    validationInstructions: WorkflowInstructionsSchema,
    validationCapabilityHints: z.array(CapabilityHintSchema).max(16),
    validationParametersSchemaSummary: z.string().trim().max(280),
    validationParametersSchemaJson: z
      .string()
      .trim()
      .max(64 * 1024),
    validationExamplesJson: z
      .string()
      .trim()
      .max(64 * 1024),
    validationIssueCodes: WorkflowValidationIssueCodeDefinitionSchema.array()
      .max(64)
      .optional(),
  })
  .strict();
export type PrivateWorkflowVersionInput = z.input<
  typeof PrivateWorkflowVersionInputSchema
>;
export type NormalizedPrivateWorkflowVersionInput = z.output<
  typeof PrivateWorkflowVersionInputSchema
>;

export const PrivateWorkflowAllowedActionsSchema = z
  .object({
    edit: z.boolean(),
    createVersion: z.boolean(),
    archive: z.boolean(),
  })
  .strict();

export const PrivateWorkflowVersionAllowedActionsSchema = z
  .object({ edit: z.boolean(), publish: z.boolean(), deprecate: z.boolean() })
  .strict();

export const ManagedPrivateWorkflowSummarySchema = z
  .object({
    id: WorkflowIdSchema,
    causeId: CauseIdSchema,
    slug: z.string(),
    name: z.string(),
    summary: z.string(),
    status: WorkflowStatusSchema,
    scope: z.literal('cause_private'),
    role: CauseMembershipRoleSchema,
    latestPublishedVersion: z
      .object({ id: WorkflowVersionIdSchema, version: SemanticVersionSchema })
      .strict()
      .nullable(),
    draftVersionCount: z.number().int().nonnegative(),
    updatedAt: z.number(),
  })
  .strict();
export type ManagedPrivateWorkflowSummary = z.infer<
  typeof ManagedPrivateWorkflowSummarySchema
>;

export const ManagedPrivateWorkflowSchema =
  ManagedPrivateWorkflowSummarySchema.extend({
    description: z.string(),
    createdBy: UserIdSchema,
    updatedBy: UserIdSchema,
    createdAt: z.number(),
    archivedAt: z.number().optional(),
    versions: z.array(
      z
        .object({
          id: WorkflowVersionIdSchema,
          version: SemanticVersionSchema,
          status: WorkflowVersionStatusSchema,
          summary: z.string(),
          inputSchema: WorkflowSchemaDescriptorSchema,
          outputSchema: WorkflowSchemaDescriptorSchema,
          createdAt: z.number(),
          publishedAt: z.number().optional(),
          deprecatedAt: z.number().optional(),
        })
        .strict(),
    ),
    allowedActions: PrivateWorkflowAllowedActionsSchema,
  }).strict();
export type ManagedPrivateWorkflow = z.infer<
  typeof ManagedPrivateWorkflowSchema
>;

export const ManagedPrivateWorkflowVersionSchema = z
  .object({
    id: WorkflowVersionIdSchema,
    workflowId: WorkflowIdSchema,
    causeId: CauseIdSchema,
    workflowName: z.string(),
    version: SemanticVersionSchema,
    status: WorkflowVersionStatusSchema,
    summary: z.string(),
    inputSchema: WorkflowSchemaDocumentSchema,
    outputSchema: WorkflowSchemaDocumentSchema,
    definitionHash: Sha256Schema,
    executionTask: AgentTaskDefinitionSchema,
    validation: WorkflowValidationDefinitionSchema.optional(),
    validationParametersSchemaDocument: WorkflowSchemaDocumentSchema.optional(),
    createdBy: UserIdSchema,
    publishedBy: UserIdSchema.optional(),
    deprecatedBy: UserIdSchema.optional(),
    createdAt: z.number(),
    publishedAt: z.number().optional(),
    deprecatedAt: z.number().optional(),
    allowedActions: PrivateWorkflowVersionAllowedActionsSchema,
  })
  .strict();
export type ManagedPrivateWorkflowVersion = z.infer<
  typeof ManagedPrivateWorkflowVersionSchema
>;

export const PrivateWorkflowErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'CAUSE_NOT_FOUND',
  'CAUSE_PERMISSION_DENIED',
  'CAUSE_OWNER_REQUIRED',
  'CAUSE_ARCHIVED',
  'INVALID_PRIVATE_WORKFLOW_INPUT',
  'PRIVATE_WORKFLOW_NOT_FOUND',
  'PRIVATE_WORKFLOW_SLUG_ALREADY_EXISTS',
  'PRIVATE_WORKFLOW_ARCHIVED',
  'PRIVATE_WORKFLOW_OWNER_REQUIRED',
  'INVALID_PRIVATE_WORKFLOW_VERSION_INPUT',
  'PRIVATE_WORKFLOW_VERSION_NOT_FOUND',
  'PRIVATE_WORKFLOW_VERSION_ALREADY_EXISTS',
  'PRIVATE_WORKFLOW_VERSION_LIMIT_REACHED',
  'PRIVATE_WORKFLOW_VERSION_IMMUTABLE',
  'INVALID_PRIVATE_WORKFLOW_VERSION_TRANSITION',
  'WORKFLOW_SCHEMA_INVALID',
]);
export type PrivateWorkflowErrorCode = z.infer<
  typeof PrivateWorkflowErrorCodeSchema
>;
