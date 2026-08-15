import { CoordinatorError } from '@causaic/coordinator-core';
import type { JobCoordinator } from '@causaic/coordinator-core';
import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import { JobIdSchema } from '@causaic/protocol';
import type { RuntimeEvent } from '@causaic/runtime-core';
import type { AgentRuntimeAdapter } from '@causaic/runtime-core';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import { describe, expect, it, vi } from 'vitest';

import { loadConvexDemoConfig, runCli, runConvexDemo } from './index.js';
import { createDemoCoordinator } from './fixtures.js';

const output = {
  directory: '/tmp/causaic-convex-demo-test',
  path: '/tmp/causaic-convex-demo-test/source-verification.json',
};

function tokens(): () => string {
  let sequence = 0;
  return () => `test-${sequence++}`;
}

function dependencies(coordinator: JobCoordinator = createDemoCoordinator()) {
  return {
    coordinator,
    approval: 'approve' as const,
    writeLine: () => undefined,
    writeArtifact: async () => output,
    createToken: tokens(),
  };
}

function emptyCoordinator(): MemoryJobCoordinator {
  return new MemoryJobCoordinator({
    now: () => Date.parse('2030-01-01T10:01:00Z'),
    createId: tokens(),
    fixtures: { campaigns: [], jobs: [] },
  });
}

describe('Convex demo orchestration', () => {
  it('completes the fake-runtime flow and returns authoritative state', async () => {
    const coordinator = createDemoCoordinator();
    const requestApproval = vi.spyOn(coordinator, 'requestApproval');
    const result = await runConvexDemo(dependencies(coordinator));

    expect(result.summary).toMatchObject({
      status: 'completed',
      runtime: 'runtime-fake',
      jobStatus: 'validating',
      runStatus: 'completed',
      leaseStatus: 'released',
    });
    expect(requestApproval.mock.calls[0]?.[0].approvalType).toBe(
      'network_access',
    );
  });

  it('paces persisted transitions through an injected wait function', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const result = await runConvexDemo({
      ...dependencies(),
      stepDelayMs: 1_000,
      wait,
    });

    expect(result.execution.status).toBe('completed');
    expect(wait.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(wait.mock.calls.every(([duration]) => duration === 1_000)).toBe(
      true,
    );
  });

  it('reports an actionable error when no compatible job is available', async () => {
    await expect(
      runConvexDemo(dependencies(emptyCoordinator())),
    ).rejects.toMatchObject({ code: 'job_unavailable' });
    await expect(
      runConvexDemo(dependencies(emptyCoordinator())),
    ).rejects.toThrow('Seed or publish a');
  });

  it('preserves coordinator lease conflicts', async () => {
    const coordinator = createDemoCoordinator();
    coordinator.acquireLease = vi.fn(async () => {
      throw new CoordinatorError('lease_conflict', 'leased');
    });

    await expect(
      runConvexDemo(dependencies(coordinator)),
    ).resolves.toMatchObject({
      execution: { status: 'failed', code: 'lease_conflict' },
    });
  });

  it('resolves approval denial and stops without an artifact', async () => {
    const writer = vi.fn().mockResolvedValue(output);
    const result = await runConvexDemo({
      ...dependencies(),
      approval: 'deny',
      writeArtifact: writer,
    });

    expect(result.summary).toMatchObject({
      status: 'cancelled',
      leaseStatus: 'released',
    });
    expect(writer).not.toHaveBeenCalled();
  });

  it('records fake-runtime failures through the coordinator', async () => {
    const coordinator = createDemoCoordinator();
    const fail = vi.spyOn(coordinator, 'failRun');
    const result = await runConvexDemo({
      ...dependencies(coordinator),
      runtime: new FakeRuntimeAdapter({
        failure: {
          checkpoint: 'verification',
          code: 'fixture_failure',
          message: 'Configured failure',
          retryable: true,
        },
      }),
    });

    expect(result.summary).toMatchObject({
      status: 'failed',
      jobStatus: 'failed_retryable',
      leaseStatus: 'released',
    });
    expect(fail).toHaveBeenCalledOnce();
  });

  it('validates runtime artifacts locally and cleans up the active run', async () => {
    const coordinator = createDemoCoordinator();
    const fail = vi.spyOn(coordinator, 'failRun');
    const delegate = new FakeRuntimeAdapter();
    const invalidArtifactRuntime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal): AsyncIterable<RuntimeEvent> {
        for await (const event of delegate.execute(session, signal)) {
          if (event.type === 'artifact.created') {
            yield {
              ...event,
              artifact: {
                ...(event.artifact as Record<string, unknown>),
                claim: '',
              },
            };
          } else {
            yield event;
          }
        }
      },
    };

    await expect(
      runConvexDemo({
        ...dependencies(coordinator),
        runtime: invalidArtifactRuntime,
      }),
    ).resolves.toMatchObject({
      execution: { status: 'failed', code: 'artifact_invalid' },
    });
    expect(fail).toHaveBeenCalledOnce();
    await expect(
      coordinator.getJobState({
        jobId: JobIdSchema.parse('job_transport-policy-report'),
      }),
    ).resolves.toMatchObject({
      status: 'failed_final',
      lease: { status: 'released' },
    });
  });

  it('attempts cleanup when the runtime throws unexpectedly', async () => {
    const coordinator = createDemoCoordinator();
    const fail = vi.spyOn(coordinator, 'failRun');
    const delegate = new FakeRuntimeAdapter();
    const throwingRuntime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal): AsyncIterable<RuntimeEvent> {
        for await (const event of delegate.execute(session, signal)) {
          if (event.type === 'phase.changed' && event.phase === 'verifying') {
            throw new Error('Runtime stream failed');
          }
          yield event;
        }
      },
    };

    await expect(
      runConvexDemo({
        ...dependencies(coordinator),
        runtime: throwingRuntime,
      }),
    ).resolves.toMatchObject({
      execution: { status: 'failed', message: 'Runtime stream failed' },
    });
    expect(fail).toHaveBeenCalledOnce();
  });

  it('releases the lease when the run was created but its response was lost', async () => {
    const coordinator = createDemoCoordinator();
    const startRun = coordinator.startRun.bind(coordinator);
    const release = vi.spyOn(coordinator, 'releaseLease');
    coordinator.startRun = vi.fn(
      async (request: Parameters<JobCoordinator['startRun']>[0]) => {
        await startRun(request);
        throw new Error('Run start response was lost');
      },
    );

    await expect(
      runConvexDemo(dependencies(coordinator)),
    ).resolves.toMatchObject({
      execution: {
        status: 'failed',
        message: 'Run start response was lost',
      },
    });
    expect(release).toHaveBeenCalledOnce();
    await expect(
      coordinator.getJobState({
        jobId: JobIdSchema.parse('job_transport-policy-report'),
      }),
    ).resolves.toMatchObject({ status: 'available' });
  });

  it('fails the run when artifact submission succeeded but its response was lost', async () => {
    const coordinator = createDemoCoordinator();
    const submitArtifact = coordinator.submitArtifact.bind(coordinator);
    const fail = vi.spyOn(coordinator, 'failRun');
    coordinator.submitArtifact = vi.fn(
      async (request: Parameters<JobCoordinator['submitArtifact']>[0]) => {
        await submitArtifact(request);
        throw new Error('Artifact submission response was lost');
      },
    );

    await expect(
      runConvexDemo(dependencies(coordinator)),
    ).resolves.toMatchObject({
      execution: {
        status: 'failed',
        message: 'Artifact submission response was lost',
      },
    });
    expect(fail).toHaveBeenCalledOnce();
    await expect(
      coordinator.getJobState({
        jobId: JobIdSchema.parse('job_transport-policy-report'),
      }),
    ).resolves.toMatchObject({ status: 'failed_retryable' });
  });

  it('preserves both execution and cleanup failures', async () => {
    const coordinator = createDemoCoordinator();
    coordinator.failRun = vi.fn(async () => {
      throw new Error('Cleanup failed');
    });
    const delegate = new FakeRuntimeAdapter();
    const throwingRuntime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal): AsyncIterable<RuntimeEvent> {
        for await (const event of delegate.execute(session, signal)) {
          if (event.type === 'phase.changed' && event.phase === 'verifying') {
            throw new Error('Execution failed');
          }
          yield event;
        }
      },
    };

    await expect(
      runConvexDemo({
        ...dependencies(coordinator),
        runtime: throwingRuntime,
      }),
    ).resolves.toMatchObject({
      execution: {
        status: 'failed',
        message: 'Execution failed',
      },
    });
  });

  it('emits one machine-readable JSON summary through the CLI', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      ['convex-demo', '--approval', 'approve', '--json'],
      {
        stdinIsTTY: false,
        writeOut: (text) => stdout.push(text),
        writeError: (text) => stderr.push(text),
        variables: {
          CONVEX_URL: 'http://127.0.0.1:3210',
          CAUSAIC_NODE_ID: 'fixture-node-1',
          CAUSAIC_DEV_NODE_SECRET: 'development-secret',
        },
        createConvexCoordinator: () => createDemoCoordinator(),
        writeArtifact: async () => output,
        createToken: tokens(),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0] ?? '')).toMatchObject({
      status: 'completed',
      jobStatus: 'validating',
    });
  });
});

describe('Convex demo configuration', () => {
  it('applies safe optional defaults', () => {
    expect(
      loadConvexDemoConfig({
        CONVEX_URL: 'http://127.0.0.1:3210',
        CAUSAIC_NODE_ID: 'fixture-node-1',
        CAUSAIC_DEV_NODE_SECRET: 'development-secret',
      }),
    ).toMatchObject({
      autoApprove: false,
      coordinator: { defaultLeaseDurationMs: 300_000 },
    });
  });

  it('prints actionable missing-environment guidance', async () => {
    expect(() => loadConvexDemoConfig({})).toThrow('Missing CONVEX_URL');
    const errors: string[] = [];
    await expect(
      runCli(['convex-demo', '--approval', 'approve'], {
        stdinIsTTY: false,
        writeOut: () => undefined,
        writeError: (text) => errors.push(text),
        variables: {},
      }),
    ).resolves.toBe(1);
    expect(errors.join('')).toContain(
      'Configure the hosted development deployment',
    );
  });

  it('reports invalid URLs and job IDs as configuration errors', () => {
    const base = {
      CONVEX_URL: 'not-a-url',
      CAUSAIC_NODE_ID: 'fixture-node-1',
      CAUSAIC_DEV_NODE_SECRET: 'development-secret',
    };
    expect(() => loadConvexDemoConfig(base)).toThrow(
      'Invalid Convex demo configuration',
    );
    expect(() =>
      loadConvexDemoConfig({
        ...base,
        CONVEX_URL: 'http://127.0.0.1:3210',
        CAUSAIC_JOB_ID: 'not-a-job-id',
      }),
    ).toThrow('Invalid CAUSAIC_JOB_ID');
  });

  it('redacts the development secret from CLI failures', async () => {
    const secret = 'do-not-print-this-secret';
    const errors: string[] = [];

    await expect(
      runCli(['convex-demo', '--approval', 'approve'], {
        stdinIsTTY: false,
        writeOut: () => undefined,
        writeError: (text) => errors.push(text),
        variables: {
          CONVEX_URL: 'http://127.0.0.1:3210',
          CAUSAIC_NODE_ID: 'fixture-node-1',
          CAUSAIC_DEV_NODE_SECRET: secret,
        },
        createConvexCoordinator: () => {
          throw new Error(`Coordinator rejected ${secret}`);
        },
      }),
    ).resolves.toBe(1);
    expect(errors.join('')).not.toContain(secret);
    expect(errors.join('')).toContain('[REDACTED]');
  });
});
