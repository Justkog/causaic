import { describe, expect, it } from 'vitest';

import {
  WorkflowValidationDefinitionSchema,
  WorkflowValidationConsentSchema,
  WorkflowValidationIssueSchema,
  WorkflowValidationSessionSchema,
  WorkflowValidationTaskDefinitionSchema,
  ValidationRunOriginSchema,
  parseWorkflowValidationResult,
  validExecutableWorkflowDefinitionFixture,
} from './index.js';

const validResult = {
  decision: 'reject' as const,
  summary: 'The artifact contains an unsupported claim.',
  issues: [
    {
      severity: 'error' as const,
      target: 'artifact' as const,
      instancePath: '/claims/0/source~1url',
      code: 'unsupported_claim',
      message: 'The cited source does not support this claim.',
    },
  ],
};

describe('workflow validation contracts', () => {
  it('requires explicit targets and validates RFC 6901 paths', () => {
    expect(
      WorkflowValidationIssueSchema.safeParse(validResult.issues[0]).success,
    ).toBe(true);
    expect(
      WorkflowValidationIssueSchema.safeParse({
        ...validResult.issues[0],
        instancePath: '/claims/0/source~2url',
      }).success,
    ).toBe(false);
    expect(
      WorkflowValidationIssueSchema.safeParse({
        severity: 'warning',
        target: 'general',
        instancePath: '/claims',
        message: 'A general warning.',
      }).success,
    ).toBe(false);
  });

  it('enforces a declared issue-code vocabulary while allowing bounded codes without one', () => {
    expect(
      parseWorkflowValidationResult(validResult, [
        {
          code: 'unsupported_claim',
          description: 'The artifact makes an unsupported claim.',
        },
      ]),
    ).toEqual(validResult);
    expect(() =>
      parseWorkflowValidationResult(validResult, [
        { code: 'missing_source', description: 'A source is missing.' },
      ]),
    ).toThrow();
    expect(parseWorkflowValidationResult(validResult, undefined)).toEqual(
      validResult,
    );
  });

  it('rejects duplicate issue-code declarations and invalid example codes', () => {
    const validation = validExecutableWorkflowDefinitionFixture.validation;
    if (validation === undefined) throw new Error('Fixture has no validation');

    expect(
      WorkflowValidationDefinitionSchema.safeParse({
        ...validation,
        issueCodes: [
          { code: 'missing_source', description: 'A source is missing.' },
          { code: 'missing_source', description: 'Duplicate.' },
        ],
      }).success,
    ).toBe(false);
    expect(
      WorkflowValidationDefinitionSchema.safeParse({
        ...validation,
        resultExamples: [validResult],
        issueCodes: [
          { code: 'missing_source', description: 'A source is missing.' },
        ],
      }).success,
    ).toBe(false);
  });

  it('uses provider-neutral validation run provenance', () => {
    expect(ValidationRunOriginSchema.parse({ type: 'test_harness' })).toEqual({
      type: 'test_harness',
    });
    expect(
      ValidationRunOriginSchema.parse({
        type: 'operator_mcp',
        executorId: 'executor_validation-host',
      }),
    ).toEqual({
      type: 'operator_mcp',
      executorId: 'executor_validation-host',
    });
    expect(() =>
      ValidationRunOriginSchema.parse({
        type: 'operator_mcp',
        executorId: 'runtime-installation_fake',
      }),
    ).toThrow();
  });

  it('keeps execution runtime metadata out of validation tasks', () => {
    const validation = validExecutableWorkflowDefinitionFixture.validation;
    if (validation === undefined) throw new Error('Fixture has no validation');
    expect(validation.task).not.toHaveProperty('supportedExecutionModes');
    expect(
      WorkflowValidationTaskDefinitionSchema.safeParse(validation.task).success,
    ).toBe(true);
  });

  it('publishes the pinned issue-code vocabulary in validation sessions', () => {
    const session = WorkflowValidationSessionSchema.parse({
      validationRunId: 'validation_run_issue-codes',
      definitionHash: `sha256:${'a'.repeat(64)}`,
      task: validExecutableWorkflowDefinitionFixture.validation?.task,
      policy: 'human_confirmation',
      issueCodes: [
        {
          code: 'unsupported_claim',
          description: 'The claim is not supported.',
        },
      ],
      detailsSchema: {
        descriptor: {
          id: 'workflow_schema_validation-details',
          dialect: 'https://json-schema.org/draft/2020-12/schema',
          hash: `sha256:${'c'.repeat(64)}`,
          summary: 'Structured semantic validation details.',
        },
        documentJson: '{"type":"object"}',
      },
      input: {
        job: { id: 'job_issue-codes', input: {} },
        artifact: {
          id: 'artifact_issue-codes',
          content: {},
          contentHash: `sha256:${'b'.repeat(64)}`,
        },
        parameters: null,
      },
    });
    expect(session.issueCodes).toEqual([
      {
        code: 'unsupported_claim',
        description: 'The claim is not supported.',
      },
    ]);
    expect(session.detailsSchema?.descriptor.id).toBe(
      'workflow_schema_validation-details',
    );
  });

  it('keeps the exact consent proposal self-contained', () => {
    const consent = WorkflowValidationConsentSchema.parse({
      id: 'consent_validation_review',
      status: 'pending',
      proposedAction: {
        type: 'artifact_decision',
        causeId: 'cause_validation',
        artifactId: 'artifact_validation',
        workflowVersionId: 'workflow_version_validation-1-0-0',
        artifactContentHash: `sha256:${'a'.repeat(64)}`,
        validationDefinitionHash: `sha256:${'b'.repeat(64)}`,
        policy: 'human_confirmation',
        validationRunId: 'validation_run_validation',
        recommendation: validResult,
        decision: 'accept',
        rationale: 'The submitted evidence is sufficient.',
      },
      actionHash: `sha256:${'c'.repeat(64)}`,
      createdAt: 1,
      expiresAt: 2,
    });
    expect(consent.proposedAction.recommendation).toEqual(validResult);
    expect(consent.proposedAction.rationale).toBe(
      'The submitted evidence is sufficient.',
    );
  });
});
