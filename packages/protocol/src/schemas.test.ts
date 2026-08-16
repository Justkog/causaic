import { describe, expect, it } from 'vitest';

import {
  ApprovalDecisionSchema,
  ApprovalRequestSchema,
  ArtifactManifestSchema,
  CampaignSchema,
  CampaignStatusSchema,
  CauseSchema,
  invalidProtocolFixtures,
  JobLeaseSchema,
  JobOfferSchema,
  JobProgressEventSchema,
  JobStatusSchema,
  ProtocolMessageSchema,
  JobDefinitionSchema,
  validApprovalDecisionFixture,
  validApprovalRequestFixture,
  validArtifactManifestFixture,
  validCampaignFixture,
  validCauseFixture,
  validCompletionEventFixture,
  validFailureEventFixture,
  validJobLeaseFixture,
  validJobOfferFixture,
  validProgressEventFixture,
  validSourceVerificationJobFixture,
  validWorkflowReferenceFixture,
  WorkflowReferenceSchema,
  WorkflowExecutionExampleSchema,
  AgentTaskDefinitionSchema,
  WorkflowToolRequirementSchema,
  JobStateSchema,
  RunFailureSchema,
} from './index.js';

const validSchemaExamples = [
  [CauseSchema, validCauseFixture],
  [WorkflowReferenceSchema, validWorkflowReferenceFixture],
  [CampaignSchema, validCampaignFixture],
  [JobDefinitionSchema, validSourceVerificationJobFixture],
  [JobOfferSchema, validJobOfferFixture],
  [JobLeaseSchema, validJobLeaseFixture],
  [JobProgressEventSchema, validProgressEventFixture],
  [ApprovalRequestSchema, validApprovalRequestFixture],
  [ApprovalDecisionSchema, validApprovalDecisionFixture],
  [ArtifactManifestSchema, validArtifactManifestFixture],
  [JobProgressEventSchema, validCompletionEventFixture],
  [JobProgressEventSchema, validFailureEventFixture],
] as const;

describe('protocol version 1 schemas', () => {
  it.each(validSchemaExamples)('accepts a valid fixture', (schema, fixture) => {
    expect(schema.safeParse(fixture).success).toBe(true);
  });

  it.each(invalidProtocolFixtures)('rejects $name', ({ schema, value }) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('exports the complete job status vocabulary', () => {
    expect(JobStatusSchema.options).toEqual([
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
  });

  it('exports the campaign lifecycle vocabulary', () => {
    expect(CampaignStatusSchema.options).toEqual([
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
  });

  it('supports the fake runtime network approval type', () => {
    expect(
      ApprovalRequestSchema.safeParse({
        ...validApprovalRequestFixture,
        approvalType: 'network_access',
      }).success,
    ).toBe(true);
  });

  it('uses the exported execution-example schema in the agent task contract', () => {
    const example = {
      input: { claim: 'A claim' },
      output: { accepted: true },
    };
    expect(WorkflowExecutionExampleSchema.safeParse(example).success).toBe(
      true,
    );
    expect(
      AgentTaskDefinitionSchema.safeParse({
        instructions: {
          objective: 'Produce an artifact.',
          procedure: 'Follow the job instructions.',
          constraints: [],
          completionCriteria: [],
        },
        supportedExecutionModes: [],
        capabilityHints: [],
        examples: [example],
      }).success,
    ).toBe(true);
    expect(
      WorkflowExecutionExampleSchema.safeParse({
        input: { claim: 'A claim' },
        notes: 'extra',
      }).success,
    ).toBe(false);
  });

  it('normalizes blank optional tool version constraints', () => {
    const result = WorkflowToolRequirementSchema.safeParse({
      kind: 'built_in',
      identifier: 'web',
      versionConstraint: '  ',
      required: true,
      summary: 'Use the web tool.',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.versionConstraint).toBeUndefined();
  });

  it('parses every cross-boundary message through the public union', () => {
    for (const fixture of [
      validCampaignFixture,
      validSourceVerificationJobFixture,
      validJobOfferFixture,
      validJobLeaseFixture,
      validProgressEventFixture,
      validApprovalRequestFixture,
      validApprovalDecisionFixture,
      validArtifactManifestFixture,
      validCompletionEventFixture,
      validFailureEventFixture,
    ]) {
      expect(ProtocolMessageSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('validates portable execution state and failure reasons', () => {
    const state = JobStateSchema.safeParse({
      id: validSourceVerificationJobFixture.id,
      campaignId: validSourceVerificationJobFixture.campaignId,
      causeId: validSourceVerificationJobFixture.causeId,
      status: 'failed_retryable',
      attemptCount: 1,
      retryPolicy: { allowReassignment: true, maxAttempts: 3 },
      run: {
        id: validJobLeaseFixture.runId,
        status: 'failed',
        failure: {
          kind: 'temporary_network_failure',
          retryable: true,
          code: 'temporary_network_failure',
          message: 'The source was temporarily unavailable.',
        },
      },
    });

    expect(state.success).toBe(true);
    expect(
      RunFailureSchema.safeParse({
        kind: 'runtime_crashed',
        retryable: false,
        code: 'runtime_crashed',
        message: 'The runtime exited unexpectedly.',
        extra: true,
      }).success,
    ).toBe(false);
  });
});
