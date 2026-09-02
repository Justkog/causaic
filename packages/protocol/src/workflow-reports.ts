import { z } from 'zod';

import {
  UserIdSchema,
  WorkflowIdSchema,
  WorkflowReportIdSchema,
  WorkflowVersionIdSchema,
} from './identifiers.js';

export const WorkflowReportStatusSchema = z.enum([
  'open',
  'dismissed',
  'actioned',
]);
export type WorkflowReportStatus = z.infer<typeof WorkflowReportStatusSchema>;

export const WorkflowReportCreateInputSchema = z
  .object({
    workflowId: WorkflowIdSchema,
    workflowVersionId: WorkflowVersionIdSchema,
    description: z.string().trim().min(10).max(2_000),
  })
  .strict();
export type WorkflowReportCreateInput = z.input<
  typeof WorkflowReportCreateInputSchema
>;

export const WorkflowReportSummarySchema = z
  .object({
    id: WorkflowReportIdSchema,
    workflowId: WorkflowIdSchema,
    workflowVersionId: WorkflowVersionIdSchema,
    status: WorkflowReportStatusSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type WorkflowReportSummary = z.infer<typeof WorkflowReportSummarySchema>;

export const WorkflowReportReporterSchema = z
  .object({
    id: UserIdSchema,
    displayName: z.string().optional(),
    email: z.string().email().optional(),
  })
  .strict();
export type WorkflowReportReporter = z.infer<
  typeof WorkflowReportReporterSchema
>;

export const WorkflowModerationReportSummarySchema =
  WorkflowReportSummarySchema.extend({
    reporter: WorkflowReportReporterSchema,
  }).strict();
export type WorkflowModerationReportSummary = z.infer<
  typeof WorkflowModerationReportSummarySchema
>;

export const WorkflowReportDetailSchema = WorkflowReportSummarySchema.extend({
  description: z.string().trim().min(10).max(2_000),
  resolvedAt: z.number().int().nonnegative().optional(),
  resolutionNote: z.string().trim().min(1).max(1_000).optional(),
}).strict();
export type WorkflowReportDetail = z.infer<typeof WorkflowReportDetailSchema>;

export const WorkflowModerationReportDetailSchema =
  WorkflowReportDetailSchema.extend({
    reporter: WorkflowReportReporterSchema,
  }).strict();
export type WorkflowModerationReportDetail = z.infer<
  typeof WorkflowModerationReportDetailSchema
>;

export const WorkflowReportErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_VERSION_NOT_FOUND',
  'WORKFLOW_VERSION_NOT_VISIBLE',
  'INVALID_WORKFLOW_REPORT_DESCRIPTION',
  'INVALID_WORKFLOW_REPORT_INPUT',
  'WORKFLOW_REPORT_NOT_FOUND',
  'WORKFLOW_REPORT_LIMIT_REACHED',
]);
export type WorkflowReportErrorCode = z.infer<
  typeof WorkflowReportErrorCodeSchema
>;

export const WorkflowModerationErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'INTERNAL_OPERATIONS_DISABLED',
  'PLATFORM_PERMISSION_DENIED',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_VERSION_NOT_FOUND',
  'WORKFLOW_REPORT_NOT_FOUND',
  'WORKFLOW_REPORT_NOT_OPEN',
  'WORKFLOW_VERSION_ALREADY_BANNED',
  'WORKFLOW_VERSION_NOT_BANNED',
  'INVALID_WORKFLOW_MODERATION_REASON',
  'INVALID_WORKFLOW_REPORT_RESOLUTION_NOTE',
]);
export type WorkflowModerationErrorCode = z.infer<
  typeof WorkflowModerationErrorCodeSchema
>;
