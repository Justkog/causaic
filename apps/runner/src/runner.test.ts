import { readFile, rm } from 'node:fs/promises';

import { ArtifactIdSchema } from '@causaic/protocol';
import type { AgentRuntimeAdapter, RuntimeEvent } from '@causaic/runtime-core';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import { describe, expect, it, vi } from 'vitest';

import {
  parseApprovalAnswer,
  parseArguments,
  runCli,
  runDemo,
  USAGE,
} from './index.js';
import type { DemoDependencies } from './demo.js';
import { createDemoCoordinator, loadDemoFixtures } from './fixtures.js';

function runTestDemo(dependencies: Omit<DemoDependencies, 'coordinator'>) {
  const fixture = dependencies.fixture ?? loadDemoFixtures();
  return runDemo({
    ...dependencies,
    fixture,
    coordinator: createDemoCoordinator(fixture),
  });
}

describe('CLI arguments', () => {
  it.each([
    [[], { command: 'help' }],
    [['--help'], { command: 'help' }],
    [['demo', '--help'], { command: 'help' }],
    [['demo'], { command: 'demo' }],
    [['convex-demo'], { command: 'convex-demo', json: false, stepDelayMs: 0 }],
    [
      ['convex-demo', '--json'],
      { command: 'convex-demo', json: true, stepDelayMs: 0 },
    ],
    [
      ['convex-demo', '--approval', 'approve', '--json'],
      {
        command: 'convex-demo',
        approval: 'approve',
        json: true,
        stepDelayMs: 0,
      },
    ],
    [
      ['convex-demo', '--step-delay-ms', '1000'],
      { command: 'convex-demo', json: false, stepDelayMs: 1000 },
    ],
    [
      ['demo', '--approval', 'approve'],
      { command: 'demo', approval: 'approve' },
    ],
    [
      ['validation-demo', 'artifact_example', '--no-confirm'],
      {
        command: 'validation-demo',
        artifactId: 'artifact_example',
        confirm: false,
      },
    ],
    [['demo', '--approval', 'deny'], { command: 'demo', approval: 'deny' }],
  ] as const)('parses %j', (args, expected) => {
    expect(parseArguments(args)).toEqual(expected);
  });

  it.each([
    [['unknown'], 'Unknown command'],
    [['demo', '--unknown'], 'Unknown option'],
    [['validation-demo'], 'requires an artifact ID'],
    [['demo', '--json'], 'Unknown option'],
    [['demo', '--step-delay-ms', '1000'], 'Unknown option'],
    [['convex-demo', '--step-delay-ms', '-1'], 'integer from 0 to 5000'],
    [['convex-demo', '--step-delay-ms', '5001'], 'integer from 0 to 5000'],
    [
      ['convex-demo', '--step-delay-ms', '1', '--step-delay-ms', '2'],
      'only be supplied once',
    ],
    [['demo', '--approval', 'maybe'], 'approve or deny'],
    [
      ['demo', '--approval', 'approve', '--approval', 'deny'],
      'only be supplied once',
    ],
  ] as const)('rejects invalid arguments %j', (args, message) => {
    expect(() => parseArguments(args)).toThrow(message);
  });

  it('prints help and rejects non-TTY interactive execution', async () => {
    const output: string[] = [];
    await expect(
      runCli(['--help'], {
        stdinIsTTY: false,
        writeOut: (text) => output.push(text),
        writeError: (text) => output.push(text),
      }),
    ).resolves.toBe(0);
    expect(output.join('')).toContain(USAGE);

    output.length = 0;
    await expect(
      runCli(['demo'], {
        stdinIsTTY: false,
        writeOut: (text) => output.push(text),
        writeError: (text) => output.push(text),
      }),
    ).resolves.toBe(1);
    expect(output.join('')).toContain('--approval approve|deny');
  });

  it.each([
    ['y', 'approve'],
    ['YES', 'approve'],
    ['', 'deny'],
    ['n', 'deny'],
  ] as const)('parses terminal answer %j', (answer, decision) => {
    expect(parseApprovalAnswer(answer)).toBe(decision);
  });

  it.each(['approve', 'deny'] as const)(
    'runs with injected %s decision',
    async (decision) => {
      const output: string[] = [];
      const prompt = vi.fn().mockResolvedValue(decision);
      const exitCode = await runCli(['demo'], {
        stdinIsTTY: true,
        writeOut: (text) => output.push(text),
        writeError: (text) => output.push(text),
        prompt,
      });
      expect(exitCode).toBe(0);
      expect(prompt).toHaveBeenCalledOnce();
      const outputLine = output.find((line) => line.startsWith('[output] '));
      if (outputLine !== undefined) {
        await rm(outputLine.slice('[output] '.length).trim(), {
          recursive: true,
          force: true,
        });
      }
    },
  );
});

describe('demo orchestration', () => {
  it('completes the approved vertical slice and writes a valid artifact', async () => {
    const lines: string[] = [];
    const result = await runTestDemo({
      approval: 'approve',
      writeLine: (line) => lines.push(line),
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Expected completion');
    expect(result.job).toMatchObject({
      status: 'validating',
      lease: { status: 'released' },
      run: { status: 'completed' },
    });
    expect(result.artifact).toMatchObject({
      artifactType: 'source_verification',
    });
    const saved = JSON.parse(
      await readFile(result.output.path, 'utf8'),
    ) as unknown;
    expect(saved).toMatchObject({ artifactType: 'source_verification' });
    expect(result.output.path.endsWith('/source-verification.json')).toBe(true);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Cause: Open Public Evidence',
        'Campaign: Transport policy report verification',
        'Job: transport-policy-report',
        'Runtime: Causaic Fake Runtime',
        '[preparing] Preparing workspace',
        '[approval] Allow access to example.gov? approved',
        '[completed] 1 claim checked, 0 warnings',
      ]),
    );
    await rm(result.output.directory, { recursive: true, force: true });
  });

  it('handles denial as cancellation and writes no artifact', async () => {
    const writer = vi.fn();
    const result = await runTestDemo({
      approval: 'deny',
      writeLine: () => undefined,
      writeArtifact: writer,
    });
    expect(result).toMatchObject({
      status: 'cancelled',
      job: { status: 'cancelled', lease: { status: 'released' } },
    });
    expect(writer).not.toHaveBeenCalled();
  });

  it('maps runtime failure into domain failure without writing output', async () => {
    const writer = vi.fn();
    const result = await runTestDemo({
      approval: 'approve',
      runtime: new FakeRuntimeAdapter({
        failure: {
          checkpoint: 'verification',
          code: 'fixture_failure',
          message: 'Configured failure',
          retryable: true,
        },
      }),
      writeLine: () => undefined,
      writeArtifact: writer,
    });
    expect(result).toMatchObject({
      status: 'failed',
      code: 'fixture_failure',
      job: { status: 'failed_retryable', lease: { status: 'released' } },
    });
    expect(writer).not.toHaveBeenCalled();
  });

  it('maps AbortSignal cancellation and writes no output', async () => {
    const controller = new AbortController();
    controller.abort();
    const writer = vi.fn();
    const result = await runTestDemo({
      approval: 'approve',
      signal: controller.signal,
      writeLine: () => undefined,
      writeArtifact: writer,
    });
    expect(result).toMatchObject({
      status: 'cancelled',
      job: { status: 'available' },
    });
    expect(writer).not.toHaveBeenCalled();
  });

  it('validates injected fixtures before execution', async () => {
    const valid = loadDemoFixtures();
    await expect(
      runTestDemo({
        fixture: { ...valid, cause: { ...valid.cause, name: '' } },
        approval: 'approve',
        writeLine: () => undefined,
      }),
    ).rejects.toThrow();
  });

  it('does not lease a job from an inactive campaign', async () => {
    const valid = loadDemoFixtures();
    await expect(
      runTestDemo({
        fixture: {
          ...valid,
          campaign: { ...valid.campaign, status: 'paused' },
        },
        approval: 'approve',
        writeLine: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'domain_campaign_not_active' });
  });

  it('rejects a mismatched completed artifact', async () => {
    const delegate = new FakeRuntimeAdapter();
    const mismatchedRuntime: AgentRuntimeAdapter = {
      detect: () => delegate.detect(),
      supports: (installation, task) => delegate.supports(installation, task),
      prepareSession: (context) => delegate.prepareSession(context),
      resolveApproval: (sessionId, decision) =>
        delegate.resolveApproval(sessionId, decision),
      async *execute(session, signal): AsyncIterable<RuntimeEvent> {
        for await (const event of delegate.execute(session, signal)) {
          if (event.type === 'session.completed') {
            yield {
              ...event,
              artifactId: ArtifactIdSchema.parse('artifact_mismatch'),
            };
          } else {
            yield event;
          }
        }
      },
    };
    await expect(
      runTestDemo({
        runtime: mismatchedRuntime,
        approval: 'approve',
        writeLine: () => undefined,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      code: 'artifact_mismatch',
      job: { status: 'failed_final' },
    });
  });
});
