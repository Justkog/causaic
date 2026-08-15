import { z } from 'zod';

import { WorkflowIdSchema, WorkflowVersionIdSchema } from './identifiers.js';
import {
  WorkflowSchemaDescriptorSchema,
  WorkflowSchemaDocumentSchema,
} from './workflow-data.js';
import {
  WorkflowToolRequirementSchema,
  WorkflowValidationPolicySchema,
} from './agent-task.js';

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

export const WorkflowCapabilitySummarySchema = z
  .object({
    type: z.literal('network_access'),
    scope: z.literal('declared_sources'),
    summary: z.string().trim().min(1).max(280),
  })
  .strict();
export type WorkflowCapabilitySummary = z.infer<
  typeof WorkflowCapabilitySummarySchema
>;

export const WorkflowApprovalCheckpointSummarySchema = z
  .object({
    id: z.string(),
    trigger: z.literal('before_network_access'),
    type: z.literal('network_access'),
    summary: z.string().trim().min(1).max(280),
  })
  .strict();
export type WorkflowApprovalCheckpointSummary = z.infer<
  typeof WorkflowApprovalCheckpointSummarySchema
>;

export const WorkflowCatalogSummarySchema = z
  .object({
    id: WorkflowIdSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    summary: z.string(),
    status: WorkflowStatusSchema,
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
    versions: z.array(WorkflowVersionSummarySchema),
  })
  .strict();
export type WorkflowCatalogDetail = z.infer<typeof WorkflowCatalogDetailSchema>;

export const WorkflowVersionDetailSchema = WorkflowVersionSummarySchema.extend({
  workflowId: WorkflowIdSchema,
  workflowName: z.string(),
  inputSchema: WorkflowSchemaDescriptorSchema,
  outputSchema: WorkflowSchemaDescriptorSchema,
  requiredCapabilities: z.array(WorkflowCapabilitySummarySchema),
  approvalCheckpoints: z.array(WorkflowApprovalCheckpointSummarySchema),
  validationSummary: z.string().optional(),
  objective: z.string(),
  toolRequirements: z.array(WorkflowToolRequirementSchema),
  validationPolicy: WorkflowValidationPolicySchema.optional(),
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
]);
export type WorkflowCatalogErrorCode = z.infer<
  typeof WorkflowCatalogErrorCodeSchema
>;
