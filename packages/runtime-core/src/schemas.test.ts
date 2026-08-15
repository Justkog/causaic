import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  RunIdSchema,
  validSourceVerificationJobFixture,
  validExecutableWorkflowDefinitionFixture,
} from '@causaic/protocol';
import { describe, expect, it } from 'vitest';

import {
  ApprovalDecisionSchema,
  PreparedSessionSchema,
  RuntimeEventSchema,
  RuntimeInstallationIdSchema,
  RuntimeInstallationSchema,
  RuntimeSessionContextSchema,
  RuntimeSessionIdSchema,
} from './index.js';

const sessionId = RuntimeSessionIdSchema.parse('runtime-session_schema-test');
const installationId = RuntimeInstallationIdSchema.parse(
  'runtime-installation_fake',
);
const approvalId = ApprovalIdSchema.parse('approval_schema-test');
const artifactId = ArtifactIdSchema.parse('artifact_schema-test');

const baseEvent = { sessionId, sequence: 0 };
const artifact = {
  artifactType: 'source_verification',
  claim: 'A claim',
  verdict: 'supported',
  citations: [{ url: 'https://example.gov/source', note: 'Primary source' }],
} as const;

describe('runtime-core schemas', () => {
  it('validates installations and prepared sessions', () => {
    const installation = {
      id: installationId,
      runtimeType: 'fake',
      displayName: 'Fake Runtime',
      version: '1.0.0',
      available: true,
    };
    expect(RuntimeInstallationSchema.safeParse(installation).success).toBe(
      true,
    );

    const context = {
      sessionId,
      installationId,
      job: validSourceVerificationJobFixture,
      workflowDefinition: validExecutableWorkflowDefinitionFixture,
      runId: RunIdSchema.parse('run_schema-test'),
      approvalId,
      artifactId,
    };
    expect(RuntimeSessionContextSchema.safeParse(context).success).toBe(true);
    expect(
      PreparedSessionSchema.safeParse({ ...context, runtimeType: 'fake' })
        .success,
    ).toBe(true);
  });

  const validEvents = [
    { ...baseEvent, type: 'session.started', installationId },
    { ...baseEvent, type: 'phase.changed', phase: 'preparing' },
    { ...baseEvent, type: 'progress', message: 'Reading source' },
    {
      ...baseEvent,
      type: 'approval.requested',
      request: {
        id: approvalId,
        type: 'network_access',
        domain: 'example.gov',
        reason: 'Read the source',
      },
    },
    { ...baseEvent, type: 'artifact.created', artifactId, artifact },
    { ...baseEvent, type: 'session.completed', artifactId },
    {
      ...baseEvent,
      type: 'session.failed',
      failure: { code: 'failure', message: 'Failed', retryable: true },
    },
    { ...baseEvent, type: 'session.cancelled', reason: 'Cancelled' },
  ] as const;

  it.each(validEvents)('accepts normalized event $type', (event) => {
    expect(RuntimeEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    { ...baseEvent, type: 'phase.changed', phase: 'downloading' },
    {
      ...baseEvent,
      type: 'approval.requested',
      request: {
        id: approvalId,
        type: 'network_access',
        domain: 'example.com',
        reason: 'Wrong domain',
      },
    },
    {
      ...baseEvent,
      type: 'artifact.created',
      artifactId,
      artifact: BigInt(1),
    },
    {
      ...baseEvent,
      type: 'session.failed',
      failure: { code: '', message: 'Failed', retryable: true },
    },
  ])('rejects invalid runtime event %#', (event) => {
    expect(RuntimeEventSchema.safeParse(event).success).toBe(false);
  });

  it('validates discriminated approval decisions', () => {
    expect(
      ApprovalDecisionSchema.safeParse({ approvalId, decision: 'approved' })
        .success,
    ).toBe(true);
    expect(
      ApprovalDecisionSchema.safeParse({ approvalId, decision: 'denied' })
        .success,
    ).toBe(false);
  });
});
