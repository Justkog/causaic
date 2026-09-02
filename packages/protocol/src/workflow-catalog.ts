import { z } from 'zod';

import {
  CauseIdSchema,
  WorkflowIdSchema,
  WorkflowVersionIdSchema,
} from './identifiers.js';
import {
  WorkflowSchemaDescriptorSchema,
  WorkflowSchemaDocumentSchema,
} from './workflow-data.js';
import {
  AgentTaskDefinitionSchema,
  CapabilityHintSchema,
  WorkflowValidationDefinitionSchema,
  WorkflowValidationPolicySchema,
} from './agent-task.js';

export const WorkflowCatalogPublisherSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('platform'),
      name: z.literal('Causaic'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('cause'),
      causeId: CauseIdSchema,
      name: z.string().trim().min(1).max(100),
      logoUrl: z.string().url().optional(),
    })
    .strict(),
]);
export type WorkflowCatalogPublisher = z.infer<
  typeof WorkflowCatalogPublisherSchema
>;

export const WorkflowCatalogAuthorVisibilitySchema = z.enum([
  'listed',
  'hidden',
]);
export type WorkflowCatalogAuthorVisibility = z.infer<
  typeof WorkflowCatalogAuthorVisibilitySchema
>;

export const WorkflowCatalogModerationStatusSchema = z.enum([
  'active',
  'banned',
]);
export type WorkflowCatalogModerationStatus = z.infer<
  typeof WorkflowCatalogModerationStatusSchema
>;

export const WorkflowStatusSchema = z.enum(['active', 'archived']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowVersionStatusSchema = z.enum([
  'draft',
  'published',
  'deprecated',
  'revoked',
]);
export type WorkflowVersionStatus = z.infer<typeof WorkflowVersionStatusSchema>;

export const WorkflowRuntimeTypeSchema = z.enum(['fake']);
export type WorkflowRuntimeType = z.infer<typeof WorkflowRuntimeTypeSchema>;

export const WorkflowCatalogSummarySchema = z
  .object({
    id: WorkflowIdSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    summary: z.string(),
    status: WorkflowStatusSchema,
    publisher: WorkflowCatalogPublisherSchema,
    latestPublishedVersion: z
      .object({
        id: WorkflowVersionIdSchema,
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type WorkflowCatalogSummary = z.infer<
  typeof WorkflowCatalogSummarySchema
>;

export const WorkflowVersionSummarySchema = z
  .object({
    id: WorkflowVersionIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    status: WorkflowVersionStatusSchema,
    summary: z.string(),
    selectable: z.boolean(),
    publishedAt: z.number().optional(),
    deprecatedAt: z.number().optional(),
    revokedAt: z.number().optional(),
  })
  .strict();
export type WorkflowVersionSummary = z.infer<
  typeof WorkflowVersionSummarySchema
>;

export const WorkflowCatalogDetailSchema = z
  .object({
    id: WorkflowIdSchema,
    slug: z.string(),
    name: z.string(),
    summary: z.string(),
    description: z.string(),
    status: WorkflowStatusSchema,
    publisher: WorkflowCatalogPublisherSchema,
    versions: z.array(WorkflowVersionSummarySchema),
  })
  .strict();
export type WorkflowCatalogDetail = z.infer<typeof WorkflowCatalogDetailSchema>;

export const WorkflowVersionDetailSchema = WorkflowVersionSummarySchema.extend({
  workflowId: WorkflowIdSchema,
  workflowName: z.string(),
  publisher: WorkflowCatalogPublisherSchema,
  inputSchema: WorkflowSchemaDescriptorSchema,
  outputSchema: WorkflowSchemaDescriptorSchema,
  capabilityHints: z.array(CapabilityHintSchema),
  validationSummary: z.string().optional(),
  objective: z.string(),
  validationPolicy: WorkflowValidationPolicySchema.optional(),
  executionTask: AgentTaskDefinitionSchema,
  validation: WorkflowValidationDefinitionSchema.optional(),
  createdAt: z.number(),
}).strict();
export type WorkflowVersionDetail = z.infer<typeof WorkflowVersionDetailSchema>;

export const WorkflowVersionSchemasSchema = z
  .object({
    workflowId: WorkflowIdSchema,
    workflowVersionId: WorkflowVersionIdSchema,
    inputSchema: WorkflowSchemaDocumentSchema,
    outputSchema: WorkflowSchemaDocumentSchema,
    validationParametersSchema: WorkflowSchemaDocumentSchema.optional(),
  })
  .strict();
export type WorkflowVersionSchemas = z.infer<
  typeof WorkflowVersionSchemasSchema
>;

export const WorkflowCatalogErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_VERSION_NOT_FOUND',
  'WORKFLOW_SLUG_ALREADY_EXISTS',
  'WORKFLOW_VERSION_ALREADY_EXISTS',
  'WORKFLOW_VERSION_NOT_PUBLISHED',
  'WORKFLOW_VERSION_NOT_SELECTABLE',
  'WORKFLOW_VERSION_HIDDEN',
  'WORKFLOW_VERSION_BANNED',
  'WORKFLOW_SHARE_NOT_FOUND',
  'WORKFLOW_SHARE_VERSION_CONFLICT',
  'WORKFLOW_SHARE_SLUG_COLLISION',
  'WORKFLOW_SHARE_TARGET_ARCHIVED',
]);
export type WorkflowCatalogErrorCode = z.infer<
  typeof WorkflowCatalogErrorCodeSchema
>;
