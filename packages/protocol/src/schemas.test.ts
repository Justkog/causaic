import { describe, expect, it } from 'vitest';

import {
  ApprovalDecisionSchema,
  ApprovalRequestSchema,
  ArtifactManifestSchema,
  ArtifactAttachmentSchema,
  CampaignSchema,
  ClaimOpportunityRequestSchema,
  ClaimedContributionSchema,
  CampaignStatusSchema,
  CauseSchema,
  ContributionOpportunityDetailSchema,
  ContributionOpportunitySummarySchema,
  invalidProtocolFixtures,
  JobLeaseSchema,
  JobProgressEventSchema,
  JobStatusSchema,
  ProtocolMessageSchema,
  JobDefinitionSchema,
  validApprovalDecisionFixture,
  validApprovalRequestFixture,
  validArtifactManifestFixture,
  validArtifactAttachmentFixture,
  validArtifactManifestWithAttachmentsFixture,
  validCampaignFixture,
  validClaimedContributionFixture,
  validContributionOpportunitySummaryFixture,
  validCauseFixture,
  validCompletionEventFixture,
  validFailureEventFixture,
  validJobLeaseFixture,
  validProgressEventFixture,
  validSourceVerificationJobFixture,
  validWorkflowReferenceFixture,
  WorkflowReferenceSchema,
  WorkflowExecutionExampleSchema,
  WorkflowValidationTaskDefinitionSchema,
  AgentTaskDefinitionSchema,
  JobStateSchema,
  RunFailureSchema,
} from './index.js';

const validSchemaExamples = [
  [CauseSchema, validCauseFixture],
  [WorkflowReferenceSchema, validWorkflowReferenceFixture],
  [CampaignSchema, validCampaignFixture],
  [JobDefinitionSchema, validSourceVerificationJobFixture],
  [JobLeaseSchema, validJobLeaseFixture],
  [
    ContributionOpportunitySummarySchema,
    validContributionOpportunitySummaryFixture,
  ],
  [ClaimedContributionSchema, validClaimedContributionFixture],
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

  it('adds bounded attachments without changing JSON-only artifacts', () => {
    expect(
      ArtifactManifestSchema.parse(validArtifactManifestFixture),
    ).not.toHaveProperty('attachments');
    expect(
      ProtocolMessageSchema.parse(validArtifactManifestWithAttachmentsFixture),
    ).toMatchObject({ attachments: [validArtifactAttachmentFixture] });
    expect(
      ArtifactAttachmentSchema.safeParse({
        ...validArtifactAttachmentFixture,
        filename: '../source-video.mp4',
      }).success,
    ).toBe(false);
    expect(
      ArtifactAttachmentSchema.safeParse({
        ...validArtifactAttachmentFixture,
        filename: 'source\u0085video.mp4',
      }).success,
    ).toBe(false);
    expect(
      ArtifactAttachmentSchema.safeParse({
        ...validArtifactAttachmentFixture,
        mediaType: 'video/mp4; charset=utf-8',
      }).success,
    ).toBe(false);
    expect(
      ArtifactManifestSchema.safeParse({
        ...validArtifactManifestWithAttachmentsFixture,
        attachments: [
          validArtifactAttachmentFixture,
          validArtifactAttachmentFixture,
        ],
      }).success,
    ).toBe(false);
    expect(
      ArtifactManifestSchema.safeParse({
        ...validArtifactManifestWithAttachmentsFixture,
        attachments: [
          {
            ...validArtifactAttachmentFixture,
            byteSize: 60 * 1024 * 1024,
          },
          {
            ...validArtifactAttachmentFixture,
            id: 'artifact_upload_source-video-2',
            byteSize: 60 * 1024 * 1024,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps opportunity discovery source-neutral and separates detail input', () => {
    expect(
      ContributionOpportunitySummarySchema.safeParse({
        ...validContributionOpportunitySummaryFixture,
        backing: { type: 'job', jobId: validSourceVerificationJobFixture.id },
      }).success,
    ).toBe(false);
    expect(
      ContributionOpportunityDetailSchema.safeParse({
        ...validContributionOpportunitySummaryFixture,
        input: validSourceVerificationJobFixture.input,
      }).success,
    ).toBe(true);
  });

  it('does not expose generation source keys in contributor job definitions', () => {
    expect(
      JobDefinitionSchema.safeParse({
        ...validSourceVerificationJobFixture,
        sourceItemKey: 'row-1',
      }).success,
    ).toBe(false);
  });

  it('validates an opportunity claim request without a backing job id', () => {
    expect(
      ClaimOpportunityRequestSchema.safeParse({
        opportunityId: validContributionOpportunitySummaryFixture.id,
        leaseId: 'lease_contract',
        runId: 'run_contract',
        nodeId: 'node_contract',
        executorId: 'executor_contract',
        contributorId: 'user_contract',
        executorType: 'plugin_host',
        durationMs: 60_000,
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

  it('uses portable capability hints for validation tasks', () => {
    expect(
      WorkflowValidationTaskDefinitionSchema.safeParse({
        instructions: {
          objective: 'Review the artifact.',
          procedure: 'Compare the artifact with the job input.',
          constraints: [],
          completionCriteria: [],
        },
        capabilityHints: [
          {
            capability: 'web.browse',
            level: 'required',
            description: 'Read declared public sources.',
          },
        ],
        examples: [],
      }).success,
    ).toBe(true);
    expect(
      WorkflowValidationTaskDefinitionSchema.safeParse({
        instructions: {
          objective: 'Review the artifact.',
          procedure: 'Compare the artifact with the job input.',
          constraints: [],
          completionCriteria: [],
        },
        capabilityManifest: [],
        toolRequirements: [],
        approvalPolicy: [],
        examples: [],
      }).success,
    ).toBe(false);
  });

  it('parses every cross-boundary message through the public union', () => {
    for (const fixture of [
      validCampaignFixture,
      validSourceVerificationJobFixture,
      validJobLeaseFixture,
      validProgressEventFixture,
      validApprovalRequestFixture,
      validApprovalDecisionFixture,
      validArtifactManifestFixture,
      validArtifactManifestWithAttachmentsFixture,
      validCompletionEventFixture,
      validFailureEventFixture,
    ]) {
      expect(ProtocolMessageSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects the removed job-offer message type', () => {
    expect(
      ProtocolMessageSchema.safeParse({
        ...validSourceVerificationJobFixture,
        messageType: 'job.offer',
      }).success,
    ).toBe(false);
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
