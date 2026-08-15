#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import type { JobCoordinator } from '@causaic/coordinator-core';
import {
  ConvexJobCoordinator,
  type ConvexCoordinatorConfig,
} from '@causaic/coordinator-convex';
import type { AgentRuntimeAdapter } from '@causaic/runtime-core';
import type { RuntimeApprovalRequest } from '@causaic/runtime-core';

import { loadConvexDemoConfig, runConvexDemo } from './convex-demo.js';
import { runDemo } from './demo.js';
import type { ArtifactWriter, InjectedApproval } from './demo.js';
import { createDemoCoordinator } from './fixtures.js';
import {
  createAuthenticatedValidationClient,
  runValidationDemo,
} from './validation-demo.js';

export const USAGE = `Usage:
  pnpm causaic-runner demo [--approval approve|deny]
  pnpm causaic-runner convex-demo [--approval approve|deny] [--json] [--step-delay-ms 0-5000]
  pnpm causaic-runner validation-demo <artifact-id> [--approval approve|deny] [--no-confirm]
  pnpm causaic-runner --help`;

export type CliOptions =
  | { readonly command: 'help' }
  | {
      readonly command: 'demo';
      readonly approval?: InjectedApproval;
    }
  | {
      readonly command: 'convex-demo';
      readonly approval?: InjectedApproval;
      readonly json: boolean;
      readonly stepDelayMs: number;
    }
  | {
      readonly command: 'validation-demo';
      readonly artifactId: string;
      readonly approval?: InjectedApproval;
      readonly confirm: boolean;
    };

export class CliUsageError extends Error {}

function redactDevelopmentSecret(
  message: string,
  variables: Readonly<Record<string, string | undefined>>,
): string {
  const secret = variables['CAUSAIC_DEV_NODE_SECRET'];
  return secret === undefined || secret.length === 0
    ? message
    : message.replaceAll(secret, '[REDACTED]');
}

export function parseApprovalAnswer(answer: string): InjectedApproval {
  return ['y', 'yes'].includes(answer.trim().toLowerCase())
    ? 'approve'
    : 'deny';
}

export function parseArguments(args: readonly string[]): CliOptions {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { command: 'help' };
  }
  if (
    args[0] !== 'demo' &&
    args[0] !== 'convex-demo' &&
    args[0] !== 'validation-demo'
  ) {
    throw new CliUsageError(`Unknown command: ${args[0]}`);
  }
  const artifactId = args[0] === 'validation-demo' ? args[1] : undefined;
  if (args[0] === 'validation-demo' && artifactId === undefined)
    throw new CliUsageError('validation-demo requires an artifact ID');
  let approval: InjectedApproval | undefined;
  let json = false;
  let stepDelayMs = 0;
  let hasStepDelay = false;
  let confirm = true;
  for (
    let index = args[0] === 'validation-demo' ? 2 : 1;
    index < args.length;
    index += 1
  ) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { command: 'help' };
    if (argument === '--json' && args[0] === 'convex-demo') {
      if (json) throw new CliUsageError('--json may only be supplied once');
      json = true;
      continue;
    }
    if (argument === '--no-confirm' && args[0] === 'validation-demo') {
      confirm = false;
      continue;
    }
    if (argument === '--step-delay-ms' && args[0] === 'convex-demo') {
      if (hasStepDelay) {
        throw new CliUsageError('--step-delay-ms may only be supplied once');
      }
      const value = args[index + 1];
      if (value === undefined || !/^\d+$/.test(value)) {
        throw new CliUsageError(
          '--step-delay-ms must be an integer from 0 to 5000',
        );
      }
      stepDelayMs = Number(value);
      if (stepDelayMs > 5_000) {
        throw new CliUsageError(
          '--step-delay-ms must be an integer from 0 to 5000',
        );
      }
      hasStepDelay = true;
      index += 1;
      continue;
    }
    if (argument !== '--approval') {
      throw new CliUsageError(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (value !== 'approve' && value !== 'deny') {
      throw new CliUsageError('--approval must be approve or deny');
    }
    if (approval !== undefined) {
      throw new CliUsageError('--approval may only be supplied once');
    }
    approval = value;
    index += 1;
  }
  if (args[0] === 'convex-demo') {
    return {
      command: 'convex-demo',
      json,
      stepDelayMs,
      ...(approval === undefined ? {} : { approval }),
    };
  }
  if (args[0] === 'validation-demo') {
    if (artifactId === undefined)
      throw new CliUsageError('validation-demo requires an artifact ID');
    return {
      command: 'validation-demo',
      artifactId,
      confirm,
      ...(approval === undefined ? {} : { approval }),
    };
  }
  return approval === undefined
    ? { command: 'demo' }
    : { command: 'demo', approval };
}

export interface CliEnvironment {
  readonly stdinIsTTY: boolean;
  readonly writeOut: (text: string) => void;
  readonly writeError: (text: string) => void;
  readonly prompt?: (
    request: RuntimeApprovalRequest,
  ) => Promise<InjectedApproval>;
  readonly variables?: Readonly<Record<string, string | undefined>>;
  readonly createConvexCoordinator?: (
    config: ConvexCoordinatorConfig,
  ) => JobCoordinator;
  readonly runtime?: AgentRuntimeAdapter;
  readonly writeArtifact?: ArtifactWriter;
  readonly now?: () => number;
  readonly createToken?: () => string;
  readonly wait?: (durationMs: number) => Promise<void>;
}

async function terminalPrompt(
  request: RuntimeApprovalRequest,
): Promise<InjectedApproval> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await terminal.question(
      `[approval] Allow access to ${request.domain}? y/N `,
    );
    return parseApprovalAnswer(answer);
  } finally {
    terminal.close();
  }
}

async function terminalConvexPrompt(
  request: RuntimeApprovalRequest,
): Promise<InjectedApproval> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await terminal.question(
      `Approval required

Cause: Open Public Evidence
Job: Verify sources in transport-policy-report
Request: Allow access to ${request.domain}
Reason: ${request.reason}

Approve? [y/N] `,
    );
    return parseApprovalAnswer(answer);
  } finally {
    terminal.close();
  }
}

export async function runCli(
  args: readonly string[],
  environment: CliEnvironment = {
    stdinIsTTY: process.stdin.isTTY === true,
    writeOut: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  },
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArguments(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    environment.writeError(`${message}\n${USAGE}\n`);
    return 1;
  }
  if (options.command === 'help') {
    environment.writeOut(`${USAGE}\n`);
    return 0;
  }
  if (options.command === 'convex-demo') {
    const variables = environment.variables ?? process.env;
    try {
      const config = loadConvexDemoConfig(variables);
      const approval =
        options.approval ?? (config.autoApprove ? 'approve' : undefined);
      if (
        approval === undefined &&
        !environment.stdinIsTTY &&
        environment.prompt === undefined
      ) {
        environment.writeError(
          `Interactive approval requires a terminal. Use --approval approve|deny.\n`,
        );
        return 1;
      }
      const coordinator =
        environment.createConvexCoordinator?.(config.coordinator) ??
        new ConvexJobCoordinator(config.coordinator);
      const result = await runConvexDemo({
        coordinator,
        nodeId: config.coordinator.nodeExternalId,
        ...(environment.runtime === undefined
          ? {}
          : { runtime: environment.runtime }),
        ...(config.jobId === undefined ? {} : { jobId: config.jobId }),
        ...(approval === undefined ? {} : { approval }),
        promptForApproval: environment.prompt ?? terminalConvexPrompt,
        leaseDurationMs: config.coordinator.defaultLeaseDurationMs,
        json: options.json,
        stepDelayMs: options.stepDelayMs,
        writeLine: (line) =>
          environment.writeOut(`${redactDevelopmentSecret(line, variables)}\n`),
        ...(environment.writeArtifact === undefined
          ? {}
          : { writeArtifact: environment.writeArtifact }),
        ...(environment.now === undefined ? {} : { now: environment.now }),
        ...(environment.createToken === undefined
          ? {}
          : { createToken: environment.createToken }),
        ...(environment.wait === undefined ? {} : { wait: environment.wait }),
      });
      return result.execution.status === 'failed' ? 1 : 0;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = redactDevelopmentSecret(rawMessage, variables);
      environment.writeError(`[error] ${message}\n`);
      return 1;
    }
  }
  if (options.command === 'validation-demo') {
    const variables = environment.variables ?? process.env;
    const convexUrl = variables['CONVEX_URL']?.trim();
    const clerkJwt = variables['CAUSAIC_CLERK_JWT']?.trim();
    if (convexUrl === undefined || clerkJwt === undefined) {
      environment.writeError(
        'validation-demo requires CONVEX_URL and CAUSAIC_CLERK_JWT.\n',
      );
      return 1;
    }
    try {
      await runValidationDemo({
        client: createAuthenticatedValidationClient(convexUrl, clerkJwt),
        artifactExternalId: options.artifactId,
        approveNetwork: options.approval !== 'deny',
        confirmRecommendation: options.confirm,
        writeLine: (line) => environment.writeOut(`${line}\n`),
      });
      return 0;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      environment.writeError(
        `[error] ${redactDevelopmentSecret(rawMessage, variables)}\n`,
      );
      return 1;
    }
  }
  if (
    options.approval === undefined &&
    !environment.stdinIsTTY &&
    environment.prompt === undefined
  ) {
    environment.writeError(
      `Interactive approval requires a terminal. Use --approval approve|deny.\n`,
    );
    return 1;
  }
  try {
    const result = await runDemo({
      coordinator: createDemoCoordinator(),
      ...(options.approval === undefined ? {} : { approval: options.approval }),
      promptForApproval: environment.prompt ?? terminalPrompt,
      writeLine: (line) => environment.writeOut(`${line}\n`),
    });
    return result.status === 'failed' ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    environment.writeError(`[error] ${message}\n`);
    return 1;
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(entryPath).href
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
