import { describe, expect, it } from 'vitest';

import {
  PrivateWorkflowPublicShareSchema,
  WorkflowCatalogAuthorVisibilitySchema,
  WorkflowCatalogModerationStatusSchema,
  WorkflowModerationErrorCodeSchema,
  WorkflowModerationReportDetailSchema,
  WorkflowModerationReportSummarySchema,
  WorkflowReportCreateInputSchema,
  WorkflowReportDetailSchema,
  WorkflowReportErrorCodeSchema,
  WorkflowReportStatusSchema,
} from './index.js';

const sharedVersion = {
  targetWorkflowId: 'workflow_source-verification',
  targetWorkflowVersionId: 'workflow_version_source-verification-1-0-0',
  publisher: {
    kind: 'cause' as const,
    causeId: 'cause_source-verification',
    name: 'Source verification',
  },
  authorVisibility: 'listed' as const,
  moderationStatus: 'active' as const,
  sharedAt: 1,
};

describe('workflow sharing and moderation protocol', () => {
  it('requires target identifiers and rejects unknown share fields', () => {
    expect(
      PrivateWorkflowPublicShareSchema.safeParse(sharedVersion).success,
    ).toBe(true);
    expect(
      PrivateWorkflowPublicShareSchema.safeParse({
        ...sharedVersion,
        sourceWorkflowVersionId: sharedVersion.targetWorkflowVersionId,
      }).success,
    ).toBe(false);
    expect(
      PrivateWorkflowPublicShareSchema.safeParse({
        ...sharedVersion,
        targetWorkflowVersionId: undefined,
      }).success,
    ).toBe(false);
  });

  it('keeps catalog state axes and report statuses closed', () => {
    expect(
      WorkflowCatalogAuthorVisibilitySchema.safeParse('listed').success,
    ).toBe(true);
    expect(
      WorkflowCatalogAuthorVisibilitySchema.safeParse('banned').success,
    ).toBe(false);
    expect(
      WorkflowCatalogModerationStatusSchema.safeParse('banned').success,
    ).toBe(true);
    expect(WorkflowReportStatusSchema.safeParse('actioned').success).toBe(true);
    expect(WorkflowReportStatusSchema.safeParse('resolved').success).toBe(
      false,
    );
  });

  it('validates report input and never accepts internal actor fields', () => {
    const report = {
      id: 'workflow_report_source-verification-1',
      workflowId: 'workflow_source-verification',
      workflowVersionId: 'workflow_version_source-verification-1-0-0',
      status: 'open' as const,
      description: 'This workflow should be investigated by the platform.',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(
      WorkflowReportCreateInputSchema.safeParse({
        workflowId: report.workflowId,
        workflowVersionId: report.workflowVersionId,
        description: report.description,
      }).success,
    ).toBe(true);
    expect(WorkflowReportDetailSchema.safeParse(report).success).toBe(true);
    expect(
      WorkflowModerationReportSummarySchema.safeParse({
        id: report.id,
        workflowId: report.workflowId,
        workflowVersionId: report.workflowVersionId,
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        reporter: { id: 'user_reporter', email: 'reporter@example.test' },
      }).success,
    ).toBe(true);
    expect(
      WorkflowModerationReportDetailSchema.safeParse({
        ...report,
        reporter: { id: 'user_reporter', email: 'reporter@example.test' },
      }).success,
    ).toBe(true);
    expect(
      WorkflowReportDetailSchema.safeParse({
        ...report,
        reporterUserId: 'user_private',
      }).success,
    ).toBe(false);
    expect(
      WorkflowReportErrorCodeSchema.safeParse('WORKFLOW_REPORT_LIMIT_REACHED')
        .success,
    ).toBe(true);
    expect(
      WorkflowReportErrorCodeSchema.safeParse(
        'INVALID_WORKFLOW_REPORT_DESCRIPTION',
      ).success,
    ).toBe(true);
    expect(
      WorkflowReportErrorCodeSchema.safeParse('INVALID_WORKFLOW_REPORT_INPUT')
        .success,
    ).toBe(true);
    expect(
      WorkflowModerationErrorCodeSchema.safeParse(
        'INTERNAL_OPERATIONS_DISABLED',
      ).success,
    ).toBe(true);
    expect(
      WorkflowModerationErrorCodeSchema.safeParse('PLATFORM_PERMISSION_DENIED')
        .success,
    ).toBe(true);
    expect(WorkflowModerationErrorCodeSchema.safeParse('UNKNOWN').success).toBe(
      false,
    );
  });
});
