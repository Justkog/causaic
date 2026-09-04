import { describe, expect, it } from 'vitest';

import {
  ArtifactDecisionIdSchema,
  ArtifactExportIdSchema,
  ArtifactIdSchema,
  CauseIdSchema,
  CauseInvitationIdSchema,
  GenerationInputIdSchema,
  OpportunityIdSchema,
  WorkstreamDependencyIdSchema,
  WorkstreamIdSchema,
  WorkflowIdSchema,
  WorkflowReportIdSchema,
  WorkflowSchemaIdSchema,
  WorkflowVersionIdSchema,
} from './identifiers.js';

describe('portable identifiers', () => {
  it('validates artifact export identifiers', () => {
    expect(
      ArtifactExportIdSchema.safeParse('artifact_export_fixture-1').success,
    ).toBe(true);
    expect(ArtifactExportIdSchema.safeParse('artifact_fixture-1').success).toBe(
      false,
    );
  });

  it('keeps base identifiers disjoint from specialized identifiers', () => {
    expect(
      CauseInvitationIdSchema.safeParse('cause_invitation_fixture').success,
    ).toBe(true);
    expect(CauseIdSchema.safeParse('cause_invitation_fixture').success).toBe(
      false,
    );

    expect(
      WorkstreamDependencyIdSchema.safeParse('workstream_dependency_fixture')
        .success,
    ).toBe(true);
    expect(
      WorkstreamIdSchema.safeParse('workstream_dependency_fixture').success,
    ).toBe(false);

    for (const specializedId of [
      'workflow_version_fixture',
      'workflow_schema_fixture',
      'workflow_report_fixture',
    ]) {
      expect(WorkflowIdSchema.safeParse(specializedId).success).toBe(false);
    }
    expect(
      WorkflowVersionIdSchema.safeParse('workflow_version_fixture').success,
    ).toBe(true);
    expect(
      WorkflowSchemaIdSchema.safeParse('workflow_schema_fixture').success,
    ).toBe(true);
    expect(
      WorkflowReportIdSchema.safeParse('workflow_report_fixture').success,
    ).toBe(true);

    expect(
      ArtifactDecisionIdSchema.safeParse('artifact_decision_fixture').success,
    ).toBe(true);
    expect(
      ArtifactIdSchema.safeParse('artifact_decision_fixture').success,
    ).toBe(false);
    expect(ArtifactIdSchema.safeParse('artifact_export_fixture').success).toBe(
      false,
    );
  });

  it('validates generation-input and opportunity identifiers', () => {
    expect(
      GenerationInputIdSchema.safeParse('generation_input_fixture-1').success,
    ).toBe(true);
    expect(
      OpportunityIdSchema.safeParse('opportunity_input-fixture-1').success,
    ).toBe(true);
    expect(
      GenerationInputIdSchema.safeParse('generation_fixture-1').success,
    ).toBe(false);
    expect(OpportunityIdSchema.safeParse('job_fixture-1').success).toBe(false);
  });
});
