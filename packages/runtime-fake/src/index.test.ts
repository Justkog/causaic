import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  RunIdSchema,
  ValidationRunIdSchema,
  JobDefinitionSchema,
  JobIdSchema,
  validSourceVerificationJobFixture,
  validExecutableWorkflowDefinitionFixture,
} from '@causaic/protocol';
import {
  RuntimeAdapterError,
  RuntimeInstallationIdSchema,
  RuntimeSessionIdSchema,
} from '@causaic/runtime-core';
import type {
  ApprovalDecision,
  PreparedSession,
  RuntimeEvent,
  RuntimeSessionContext,
  ValidationRuntimeEvent,
  ValidationRuntimeSessionContext,
} from '@causaic/runtime-core';
import { describe, expect, it } from 'vitest';

import { FakeRuntimeAdapter } from './index.js';

function context(suffix = 'test'): RuntimeSessionContext {
  return {
    sessionId: RuntimeSessionIdSchema.parse(`runtime-session_${suffix}`),
    installationId: RuntimeInstallationIdSchema.parse(
      'runtime-installation_fake',
    ),
    job: JobDefinitionSchema.parse(validSourceVerificationJobFixture),
    workflowDefinition: validExecutableWorkflowDefinitionFixture,
    runId: RunIdSchema.parse(`run_${suffix}`),
    approvalId: ApprovalIdSchema.parse(`approval_${suffix}`),
    artifactId: ArtifactIdSchema.parse(`artifact_${suffix}`),
  };
}

async function prepared(
  runtime: FakeRuntimeAdapter,
  suffix = 'test',
): Promise<PreparedSession> {
  return runtime.prepareSession(context(suffix));
}

function iteratorFor(
  stream: AsyncIterable<RuntimeEvent>,
): AsyncIterator<RuntimeEvent> {
  return stream[Symbol.asyncIterator]();
}

async function eventsThroughApproval(
  runtime: FakeRuntimeAdapter,
  session: PreparedSession,
  signal = new AbortController().signal,
): Promise<{
  events: RuntimeEvent[];
  iterator: AsyncIterator<RuntimeEvent>;
}> {
  const iterator = iteratorFor(runtime.execute(session, signal));
  const events: RuntimeEvent[] = [];
  for (let index = 0; index < 4; index += 1) {
    const next = await iterator.next();
    if (next.done) throw new Error('Fake runtime ended before approval');
    events.push(next.value);
  }
  return { events, iterator };
}

async function collectAfterApproval(
  runtime: FakeRuntimeAdapter,
  session: PreparedSession,
  decision: ApprovalDecision,
): Promise<RuntimeEvent[]> {
  const { events, iterator } = await eventsThroughApproval(runtime, session);
  await runtime.resolveApproval(session.sessionId, decision);
  for (;;) {
    const next = await iterator.next();
    if (next.done) return events;
    events.push(next.value);
  }
}

describe('FakeRuntimeAdapter', () => {
  it('runs a deterministic validation session without an approval step', async () => {
    const runtime = new FakeRuntimeAdapter();
    const definition = validExecutableWorkflowDefinitionFixture;
    if (definition.validation === undefined)
      throw new Error('Fixture validation definition is missing');
    const context: ValidationRuntimeSessionContext = {
      sessionId: RuntimeSessionIdSchema.parse(
        'runtime-session_validation-test',
      ),
      installationId: RuntimeInstallationIdSchema.parse(
        'runtime-installation_fake',
      ),
      validationRunId: ValidationRunIdSchema.parse(
        'validation_run_validation-test',
      ),
      task: definition.validation.task,
      input: {
        job: {
          id: JobIdSchema.parse(validSourceVerificationJobFixture.id),
          input: validSourceVerificationJobFixture.input,
        },
        artifact: {
          id: ArtifactIdSchema.parse('artifact_validation-test'),
          content: {
            artifactType: 'source_verification',
            claim: 'Causaic fixtures are validated with Zod.',
            verdict: 'supported',
            citations: [
              {
                url: 'https://example.gov/source',
                note: 'The source supports the claim.',
              },
            ],
          },
          contentHash:
            'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
        parameters: {},
      },
    };
    const session = await runtime.prepareValidationSession(context);
    const stream = runtime.executeValidation(
      session,
      new AbortController().signal,
    );
    const iterator = stream[Symbol.asyncIterator]();
    const events: ValidationRuntimeEvent[] = [];
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      events.push(next.value);
    }
    expect(events.at(-1)).toMatchObject({
      type: 'validation.completed',
      result: { decision: 'accept' },
    });
  });

  it('detects one deterministic fake installation', async () => {
    const runtime = new FakeRuntimeAdapter();
    await expect(runtime.detect()).resolves.toEqual([
      {
        id: 'runtime-installation_fake',
        runtimeType: 'fake',
        displayName: 'Causaic Fake Runtime',
        version: '2.0.0',
        available: true,
      },
    ]);
    const [detected] = await runtime.detect();
    expect(detected).toBeDefined();
    if (detected === undefined) return;
    expect(
      runtime.supports(
        detected,
        validExecutableWorkflowDefinitionFixture.execution,
      ),
    ).toBe(true);
    expect(
      runtime.supports(detected, {
        ...validExecutableWorkflowDefinitionFixture.execution,
        capabilityHints: [
          {
            capability: 'social.publish',
            level: 'required',
            description: 'Publish through any suitable authenticated channel.',
            suggestedProviders: [
              {
                kind: 'mcp',
                name: 'Example MCP',
                description: undefined,
                reference: undefined,
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('prepares identical context idempotently and rejects conflicts', async () => {
    const runtime = new FakeRuntimeAdapter();
    const first = await runtime.prepareSession(context());
    await expect(runtime.prepareSession(context())).resolves.toEqual(first);
    await expect(
      runtime.prepareSession({
        ...context(),
        runId: RunIdSchema.parse('run_other'),
      }),
    ).rejects.toMatchObject({ code: 'session_conflict' });
  });

  it('pauses at approval then emits the exact happy path', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const { events, iterator } = await eventsThroughApproval(runtime, session);
    let settled = false;
    const pending = iterator.next().then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    await runtime.resolveApproval(session.sessionId, {
      approvalId: session.approvalId,
      decision: 'approved',
    });
    const resumed = await pending;
    if (resumed.done) throw new Error('Fake runtime did not resume');
    events.push(resumed.value);
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      events.push(next.value);
    }

    expect(events.map(({ type }) => type)).toEqual([
      'session.started',
      'phase.changed',
      'progress',
      'approval.requested',
      'phase.changed',
      'progress',
      'artifact.created',
      'session.completed',
    ]);
    expect(events.map(({ sequence }) => sequence)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(events[1]).toMatchObject({ phase: 'preparing' });
    expect(events[2]).toMatchObject({
      message: 'Reading source from example.gov',
    });
    expect(events[3]).toMatchObject({
      request: { type: 'network_access', domain: 'example.gov' },
    });
    expect(events[4]).toMatchObject({ phase: 'verifying' });
    const artifactEvent = events[6];
    expect(artifactEvent?.type).toBe('artifact.created');
    if (artifactEvent?.type !== 'artifact.created') {
      throw new Error('Expected artifact event');
    }
    expect(artifactEvent.artifact).toMatchObject({
      artifactType: 'source_verification',
      verdict: 'supported',
    });
  });

  it('fails non-retryably when approval is denied', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const events = await collectAfterApproval(runtime, session, {
      approvalId: session.approvalId,
      decision: 'denied',
      reason: 'User denied example.gov access',
    });
    expect(events.at(-1)).toMatchObject({
      type: 'session.failed',
      failure: { code: 'approval_denied', retryable: false },
    });
  });

  it('makes exact duplicate decisions idempotent and rejects conflicts', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const { iterator } = await eventsThroughApproval(runtime, session);
    const decision = {
      approvalId: session.approvalId,
      decision: 'approved',
    } as const;
    await runtime.resolveApproval(session.sessionId, decision);
    await iterator.next();
    await expect(
      runtime.resolveApproval(session.sessionId, decision),
    ).resolves.toBeUndefined();
    await expect(
      runtime.resolveApproval(session.sessionId, {
        approvalId: session.approvalId,
        decision: 'denied',
        reason: 'Changed decision',
      }),
    ).rejects.toMatchObject({ code: 'approval_already_resolved' });
  });

  it('rejects mismatched or missing pending approvals', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    await expect(
      runtime.resolveApproval(session.sessionId, {
        approvalId: session.approvalId,
        decision: 'approved',
      }),
    ).rejects.toMatchObject({ code: 'approval_not_pending' });
    await eventsThroughApproval(runtime, session);
    await expect(
      runtime.resolveApproval(session.sessionId, {
        approvalId: ApprovalIdSchema.parse('approval_other'),
        decision: 'approved',
      }),
    ).rejects.toMatchObject({ code: 'approval_mismatch' });
  });

  it('rejects unknown and repeated execution sessions', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const unknown = {
      ...session,
      sessionId: RuntimeSessionIdSchema.parse('runtime-session_unknown'),
    };
    await expect(
      iteratorFor(
        runtime.execute(unknown, new AbortController().signal),
      ).next(),
    ).rejects.toMatchObject({ code: 'unknown_session' });

    const events = await collectAfterApproval(runtime, session, {
      approvalId: session.approvalId,
      decision: 'approved',
    });
    expect(events.at(-1)?.type).toBe('session.completed');
    await expect(
      iteratorFor(
        runtime.execute(session, new AbortController().signal),
      ).next(),
    ).rejects.toMatchObject({ code: 'session_already_executed' });
  });

  it('cancels before execution starts', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const controller = new AbortController();
    controller.abort();
    const events: RuntimeEvent[] = [];
    for await (const event of runtime.execute(session, controller.signal))
      events.push(event);
    expect(events).toMatchObject([{ type: 'session.cancelled', sequence: 0 }]);
  });

  it('cancels between ordinary events', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const controller = new AbortController();
    const iterator = iteratorFor(runtime.execute(session, controller.signal));
    await iterator.next();
    controller.abort();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'session.cancelled' },
    });
  });

  it('cancels while approval is pending', async () => {
    const runtime = new FakeRuntimeAdapter();
    const session = await prepared(runtime);
    const controller = new AbortController();
    const { iterator } = await eventsThroughApproval(
      runtime,
      session,
      controller.signal,
    );
    const pending = iterator.next();
    controller.abort();
    await expect(pending).resolves.toMatchObject({
      value: { type: 'session.cancelled' },
    });
  });

  it.each([
    ['preparation', false],
    ['verification', true],
    ['artifact', false],
  ] as const)(
    'fails deterministically at %s',
    async (checkpoint, retryable) => {
      const runtime = new FakeRuntimeAdapter({
        failure: {
          checkpoint,
          code: `${checkpoint}_failure`,
          message: `Configured ${checkpoint} failure`,
          retryable,
        },
      });
      const session = await prepared(runtime, checkpoint);
      const events =
        checkpoint === 'preparation'
          ? await (async () => {
              const collected: RuntimeEvent[] = [];
              for await (const event of runtime.execute(
                session,
                new AbortController().signal,
              )) {
                collected.push(event);
              }
              return collected;
            })()
          : await collectAfterApproval(runtime, session, {
              approvalId: session.approvalId,
              decision: 'approved',
            });
      expect(events.at(-1)).toMatchObject({
        type: 'session.failed',
        failure: { code: `${checkpoint}_failure`, retryable },
      });
      if (checkpoint === 'artifact') {
        expect(events.at(-2)?.type).toBe('artifact.created');
      }
    },
  );

  it('keeps concurrent session approvals isolated', async () => {
    const runtime = new FakeRuntimeAdapter();
    const first = await prepared(runtime, 'first');
    const second = await prepared(runtime, 'second');
    const firstStream = await eventsThroughApproval(runtime, first);
    const secondStream = await eventsThroughApproval(runtime, second);
    const secondPending = secondStream.iterator.next();
    let secondSettled = false;
    void secondPending.then(() => {
      secondSettled = true;
    });
    await runtime.resolveApproval(first.sessionId, {
      approvalId: first.approvalId,
      decision: 'approved',
    });
    await firstStream.iterator.next();
    await Promise.resolve();
    expect(secondSettled).toBe(false);
    await runtime.resolveApproval(second.sessionId, {
      approvalId: second.approvalId,
      decision: 'approved',
    });
    await expect(secondPending).resolves.toMatchObject({
      value: { type: 'phase.changed', phase: 'verifying' },
    });
  });

  it('exposes typed adapter errors', () => {
    expect(new RuntimeAdapterError('unknown_session', 'Unknown')).toMatchObject(
      {
        name: 'RuntimeAdapterError',
        code: 'unknown_session',
      },
    );
  });
});
