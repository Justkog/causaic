import {
  ExecutorIdSchema,
  LeaseIdSchema,
  NodeIdSchema,
  RunIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import type { JobCoordinator } from '@causaic/coordinator-core';
import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import type { AgentRuntimeAdapter } from '@causaic/runtime-core';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowArtifactValidator } from './artifacts.js';
import { LocalRunnerService } from './service.js';
import type { LocalArtifactStore } from './types.js';
import {
  createRunnerCoreTestOpportunity,
  requireAvailableInstallation,
  runnerCoreTestIds,
  runnerCoreTestFixtures,
} from './testing.js';

function createRunnerCoreTestCoordinator(): JobCoordinator {
  let sequence = 0;
  return new MemoryJobCoordinator({
    now: () => Date.parse('2030-01-01T10:01:00Z'),
    createId: () => `runner-core-${sequence++}`,
    fixtures: runnerCoreTestFixtures,
  });
}

async function setup(options?: {
  readonly runtime?: AgentRuntimeAdapter;
  readonly decision?: 'approved' | 'denied';
  readonly configureCoordinator?: (coordinator: JobCoordinator) => void;
  readonly artifactStore?: LocalArtifactStore;
  readonly signal?: AbortSignal;
}) {
  const coordinator = createRunnerCoreTestCoordinator();
  options?.configureCoordinator?.(coordinator);
  const runtime = options?.runtime ?? new FakeRuntimeAdapter();
  const opportunity = createRunnerCoreTestOpportunity();
  const installation = await requireAvailableInstallation(
    await runtime.detect(),
  );
  const store = vi.fn().mockResolvedValue({
    directory: '/tmp/runner-core-test',
    path: '/tmp/runner-core-test/source-verification.json',
  });
  const service = new LocalRunnerService({
    coordinator,
    runtime,
    approvalProvider: {
      requestDecision: async () =>
        options?.decision === 'denied'
          ? { decision: 'denied', reason: 'Denied in test' }
          : { decision: 'approved' },
    },
    artifactValidator: new WorkflowArtifactValidator(),
    artifactStore: options?.artifactStore ?? { persist: store },
    ids: runnerCoreTestIds,
    now: () => Date.parse('2030-01-01T10:01:00Z'),
  });
  return {
    coordinator,
    store,
    running: service.start({
      opportunity,
      leaseId: LeaseIdSchema.parse('lease_runner-core-test'),
      runId: RunIdSchema.parse('run_runner-core-test'),
      installation,
      executorId: ExecutorIdSchema.parse('executor_runner-core-test'),
      nodeId: NodeIdSchema.parse('node_runner-core-test'),
      contributorId: UserIdSchema.parse('user_runner-core-test'),
      executorType: 'plugin_host',
      leaseDurationMs: 60_000,
      approvalExpiresInMs: 30_000,
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
    }),
  };
}

async function eventTypes(events: AsyncIterable<{ readonly type: string }>) {
  const types: string[] = [];
  for await (const event of events) types.push(event.type);
  return types;
}

describe('LocalRunnerService', () => {
  it('completes one selected opportunity and emits one ordered terminal event', async () => {
    const { running, store } = await setup();
    const typesPromise = eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'completed',
      job: { status: 'validating', run: { status: 'completed' } },
    });
    const types = await typesPromise;
    expect(types).toEqual([
      'opportunity.claimed',
      'runtime.selected',
      'lease.acquired',
      'run.started',
      'phase.changed',
      'progress',
      'approval.requested',
      'approval.resolved',
      'phase.changed',
      'progress',
      'artifact.produced',
      'artifact.submitted',
      'execution.completed',
    ]);
    expect(types.filter((type) => type.startsWith('execution.'))).toHaveLength(
      1,
    );
    expect(store).toHaveBeenCalledOnce();
  });

  it('buffers events for a late single consumer', async () => {
    const { running } = await setup();
    await expect(running.result).resolves.toMatchObject({
      status: 'completed',
    });
    const types = await eventTypes(running.events);
    expect(types.at(-1)).toBe('execution.completed');
    expect(() => running.events[Symbol.asyncIterator]()).toThrow(
      'supports one consumer',
    );
  });

  it('treats approval denial as cancellation', async () => {
    const { running } = await setup({ decision: 'denied' });
    const typesPromise = eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(await typesPromise).toContain('execution.cancelled');
  });

  it('cancels before lease acquisition without mutating the job', async () => {
    const controller = new AbortController();
    controller.abort('Cancelled before lease');
    const { running } = await setup({
      signal: controller.signal,
      configureCoordinator: (coordinator) => {
        coordinator.getJobState = async () => {
          throw new Error('An unclaimed opportunity has no job state');
        };
      },
    });
    const typesPromise = eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'cancelled',
      reason: 'Cancelled before lease',
    });
    const result = await running.result;
    expect(result.job).toBeUndefined();
    expect(await typesPromise).not.toContain('lease.acquired');
  });

  it('releases a lease when selection fails after claiming', async () => {
    const { running } = await setup({
      configureCoordinator: (coordinator) => {
        coordinator.getWorkflowDefinition = async () => {
          throw new Error('Workflow definition unavailable');
        };
      },
    });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'failed',
      error: { message: 'Workflow definition unavailable' },
      job: { status: 'available' },
    });
  });

  it.each([
    [true, 'available'],
    [false, 'failed_final'],
  ] as const)(
    'preserves runtime retryability %s in coordinator state',
    async (retryable, expectedStatus) => {
      const runtime = new FakeRuntimeAdapter({
        failure: {
          checkpoint: 'verification',
          code: 'configured_runtime_failure',
          message: 'Configured runtime failure',
          retryable,
        },
      });
      const { running } = await setup({ runtime });
      void eventTypes(running.events);
      await expect(running.result).resolves.toMatchObject({
        status: 'failed',
        job: {
          status: expectedStatus,
          run: {
            failure: { retryable, code: 'configured_runtime_failure' },
          },
        },
      });
    },
  );

  it('cancels idempotently while approval is pending', async () => {
    let approvalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      approvalStarted = resolve;
    });
    const coordinator = createRunnerCoreTestCoordinator();
    const runtime = new FakeRuntimeAdapter();
    const opportunity = createRunnerCoreTestOpportunity();
    const installation = await requireAvailableInstallation(
      await runtime.detect(),
    );
    const service = new LocalRunnerService({
      coordinator,
      runtime,
      approvalProvider: {
        requestDecision: (_request, signal) => {
          approvalStarted();
          return new Promise((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () =>
                reject(
                  new Error(
                    typeof signal.reason === 'string'
                      ? signal.reason
                      : 'Approval interrupted',
                  ),
                ),
              { once: true },
            ),
          );
        },
      },
      artifactValidator: new WorkflowArtifactValidator(),
      artifactStore: {
        persist: async () => ({
          directory: '/tmp',
          path: '/tmp/artifact.json',
        }),
      },
      ids: runnerCoreTestIds,
      now: () => Date.parse('2030-01-01T10:01:00Z'),
    });
    const running = service.start({
      opportunity,
      leaseId: LeaseIdSchema.parse('lease_runner-core-test'),
      runId: RunIdSchema.parse('run_runner-core-test'),
      installation,
      executorId: ExecutorIdSchema.parse('executor_runner-core-test'),
      nodeId: NodeIdSchema.parse('node_runner-core-test'),
      contributorId: UserIdSchema.parse('user_runner-core-test'),
      executorType: 'plugin_host',
      leaseDurationMs: 60_000,
      approvalExpiresInMs: 30_000,
    });
    const typesPromise = eventTypes(running.events);
    await started;
    await Promise.all([
      running.cancel('Interrupted'),
      running.cancel('Interrupted'),
    ]);
    await expect(running.result).resolves.toMatchObject({
      status: 'cancelled',
      job: { status: 'available' },
    });
    expect(
      (await typesPromise).filter((type) => type === 'execution.cancelled'),
    ).toHaveLength(1);
  });

  it('recovers completion when the coordinator response is lost', async () => {
    const { running } = await setup({
      configureCoordinator: (coordinator) => {
        const complete = coordinator.completeRun.bind(coordinator);
        coordinator.completeRun = async (request) => {
          await complete(request);
          throw new Error('Completion response was lost');
        };
      },
    });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'completed',
      job: { status: 'validating' },
    });
  });

  it('releases a persisted run when start response is lost', async () => {
    const { running } = await setup({
      configureCoordinator: (coordinator) => {
        const start = coordinator.startRun.bind(coordinator);
        coordinator.startRun = async (request) => {
          await start(request);
          throw new Error('Start response was lost');
        };
      },
    });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'failed',
      error: { message: 'Start response was lost' },
      job: { status: 'available' },
    });
  });

  it('cancels after artifact submission without completing the run', async () => {
    let submitted!: () => void;
    let releaseResponse!: () => void;
    const submissionStarted = new Promise<void>((resolve) => {
      submitted = resolve;
    });
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const { running } = await setup({
      configureCoordinator: (coordinator) => {
        const submit = coordinator.submitArtifact.bind(coordinator);
        coordinator.submitArtifact = async (request) => {
          const artifact = await submit(request);
          submitted();
          await responseGate;
          return artifact;
        };
      },
    });
    void eventTypes(running.events);
    await submissionStarted;
    const cancellation = running.cancel('Interrupted after submission');
    releaseResponse();
    await cancellation;
    await expect(running.result).resolves.toMatchObject({
      status: 'cancelled',
      job: { status: 'available' },
    });
  });

  it('retains local recovery data when artifact submission response is lost', async () => {
    const { running } = await setup({
      configureCoordinator: (coordinator) => {
        const submit = coordinator.submitArtifact.bind(coordinator);
        coordinator.submitArtifact = async (request) => {
          await submit(request);
          throw new Error('Submission response was lost');
        };
      },
    });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'failed',
      recovery: {
        artifactId: 'artifact_runner-core-test',
        submissionConfirmed: false,
        output: { path: '/tmp/runner-core-test/source-verification.json' },
      },
    });
  });

  it('classifies local artifact storage failures as retryable', async () => {
    const storageError = new Error('Temporary disk failure');
    const { running } = await setup({
      artifactStore: {
        persist: async () => {
          throw storageError;
        },
      },
    });
    void eventTypes(running.events);
    const result = await running.result;
    expect(result).toMatchObject({
      status: 'failed',
      error: { stage: 'artifact_persistence', retryable: true },
    });
    if (result.status !== 'failed') throw new Error('Expected failure');
    expect(result.error.cause).toBe(storageError);
  });

  it('ignores exact runtime event replays without duplicate progress writes', async () => {
    const delegate = new FakeRuntimeAdapter();
    const runtime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal) {
        for await (const event of delegate.execute(session, signal)) {
          yield event;
          yield event;
        }
      },
    };
    let progressCalls = 0;
    const { running } = await setup({
      runtime,
      configureCoordinator: (coordinator) => {
        const report = coordinator.reportProgress.bind(coordinator);
        coordinator.reportProgress = async (request) => {
          progressCalls += 1;
          await report(request);
        };
      },
    });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'completed',
    });
    expect(progressCalls).toBe(4);
  });

  it('fails final when completion has no matching artifact', async () => {
    const delegate = new FakeRuntimeAdapter();
    const runtime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal) {
        for await (const event of delegate.execute(session, signal))
          if (event.type !== 'artifact.created') yield event;
      },
    };
    const { running } = await setup({ runtime });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'artifact_mismatch', retryable: false },
      job: { status: 'failed_final' },
    });
  });

  it('rejects conflicting duplicate runtime sequences', async () => {
    const delegate = new FakeRuntimeAdapter();
    const runtime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal) {
        for await (const event of delegate.execute(session, signal)) {
          yield event;
          if (event.type === 'progress')
            yield { ...event, message: `${event.message} conflicting` };
        }
      },
    };
    const { running } = await setup({ runtime });
    void eventTypes(running.events);
    await expect(running.result).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'runtime_sequence_conflict', retryable: false },
    });
  });

  it('keeps the primary cause when cleanup also fails', async () => {
    const delegate = new FakeRuntimeAdapter();
    const primary = new Error('Runtime stream failed');
    const cleanup = new Error('Cleanup failed');
    const runtime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal) {
        for await (const event of delegate.execute(session, signal)) {
          if (event.type === 'phase.changed' && event.phase === 'verifying')
            throw primary;
          yield event;
        }
      },
    };
    const { running } = await setup({
      runtime,
      configureCoordinator: (coordinator) => {
        coordinator.failRun = async () => {
          throw cleanup;
        };
      },
    });
    void eventTypes(running.events);
    const result = await running.result;
    expect(result).toMatchObject({
      status: 'failed',
      error: { message: primary.message, cleanupError: cleanup },
    });
    if (result.status !== 'failed') throw new Error('Expected failure');
    expect(result.error.cause).toBe(primary);
  });
});
