import { randomUUID } from 'node:crypto';

import type { JobCoordinator } from '@causaic/coordinator-core';
import {
  ConvexCoordinatorConfigSchema,
  type ConvexCoordinatorConfig,
} from '@causaic/coordinator-convex';
import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  JobIdSchema,
  OpportunityIdSchema,
} from '@causaic/protocol';
import type { JobId, NodeId } from '@causaic/protocol';
import { RuntimeSessionIdSchema } from '@causaic/runtime-core';
import type {
  AgentRuntimeAdapter,
  RuntimeApprovalRequest,
} from '@causaic/runtime-core';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import { z } from 'zod';

import type { ArtifactWriter, DemoResult, InjectedApproval } from './demo.js';
import { RunnerError, runDemo } from './demo.js';
import { loadDemoFixtures } from './fixtures.js';

const DEFAULT_LEASE_DURATION_MS = 300_000;
const FIXTURE_JOB_ID = JobIdSchema.parse('job_transport-policy-report');

const ConvexDemoEnvironmentSchema = z.object({
  CONVEX_URL: z.string().trim().min(1),
  CAUSAIC_NODE_ID: z.string().trim().min(1),
  CAUSAIC_DEV_NODE_SECRET: z.string().trim().min(1),
  CAUSAIC_JOB_ID: z.string().trim().min(1).optional(),
  CAUSAIC_AUTO_APPROVE: z.enum(['true', 'false']).default('false'),
  CAUSAIC_DEFAULT_LEASE_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(3_600_000)
    .default(DEFAULT_LEASE_DURATION_MS),
});

export interface ConvexDemoConfig {
  readonly coordinator: ConvexCoordinatorConfig;
  readonly jobId?: JobId;
  readonly autoApprove: boolean;
}

export class ConvexDemoConfigurationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConvexDemoConfigurationError';
  }
}

function missingVariableMessage(name: string): string {
  if (name === 'CONVEX_URL') {
    return `Missing CONVEX_URL. Configure the hosted development deployment
URL before running the live Convex demo.`;
  }
  return `Missing ${name}. See packages/coordinator-convex/README.md for local configuration.`;
}

export function loadConvexDemoConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ConvexDemoConfig {
  for (const name of [
    'CONVEX_URL',
    'CAUSAIC_NODE_ID',
    'CAUSAIC_DEV_NODE_SECRET',
  ] as const) {
    if (environment[name]?.trim()) continue;
    throw new ConvexDemoConfigurationError(missingVariableMessage(name));
  }
  const parsed = ConvexDemoEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ConvexDemoConfigurationError(
      `Invalid Convex demo configuration: ${z.prettifyError(parsed.error)}`,
      { cause: parsed.error },
    );
  }
  const coordinator = ConvexCoordinatorConfigSchema.safeParse({
    convexUrl: parsed.data.CONVEX_URL,
    nodeExternalId: parsed.data.CAUSAIC_NODE_ID,
    developmentSecret: parsed.data.CAUSAIC_DEV_NODE_SECRET,
    defaultLeaseDurationMs: parsed.data.CAUSAIC_DEFAULT_LEASE_DURATION_MS,
  });
  if (!coordinator.success) {
    throw new ConvexDemoConfigurationError(
      `Invalid Convex demo configuration: ${z.prettifyError(coordinator.error)}`,
      { cause: coordinator.error },
    );
  }
  const jobId =
    parsed.data.CAUSAIC_JOB_ID === undefined
      ? undefined
      : JobIdSchema.safeParse(parsed.data.CAUSAIC_JOB_ID);
  if (jobId !== undefined && !jobId.success) {
    throw new ConvexDemoConfigurationError(
      `Invalid CAUSAIC_JOB_ID: ${z.prettifyError(jobId.error)}`,
      { cause: jobId.error },
    );
  }
  return {
    coordinator: coordinator.data,
    ...(jobId?.success === true ? { jobId: jobId.data } : {}),
    autoApprove: parsed.data.CAUSAIC_AUTO_APPROVE === 'true',
  };
}

export interface ConvexDemoDependencies {
  readonly coordinator: JobCoordinator;
  readonly runtime?: AgentRuntimeAdapter;
  readonly jobId?: JobId;
  readonly approval?: InjectedApproval;
  readonly promptForApproval?: (
    request: RuntimeApprovalRequest,
  ) => Promise<InjectedApproval>;
  readonly leaseDurationMs?: number;
  readonly json?: boolean;
  readonly writeLine?: (line: string) => void;
  readonly writeArtifact?: ArtifactWriter;
  readonly signal?: AbortSignal;
  readonly nodeId?: NodeId;
  readonly now?: () => number;
  readonly createToken?: () => string;
  readonly stepDelayMs?: number;
  readonly wait?: (durationMs: number) => Promise<void>;
}

export interface ConvexDemoSummary {
  readonly status: DemoResult['status'];
  readonly cause: string;
  readonly job: JobId;
  readonly run?: string;
  readonly runtime: 'runtime-fake';
  readonly artifact?: string;
  readonly jobStatus: string;
  readonly runStatus?: string;
  readonly leaseStatus?: string;
}

export interface ConvexDemoResult {
  readonly execution: DemoResult;
  readonly summary: ConvexDemoSummary;
}

function printSummary(
  summary: ConvexDemoSummary,
  json: boolean,
  writeLine: (line: string) => void,
): void {
  if (json) {
    writeLine(JSON.stringify(summary));
    return;
  }
  writeLine('');
  writeLine(
    summary.status === 'completed'
      ? 'Causaic Convex demo completed'
      : `Causaic Convex demo ${summary.status}`,
  );
  writeLine('');
  writeLine(`Cause: ${summary.cause}`);
  writeLine(`Job: ${summary.job}`);
  if (summary.run !== undefined) writeLine(`Run: ${summary.run}`);
  writeLine(`Runtime: ${summary.runtime}`);
  if (summary.artifact !== undefined)
    writeLine(`Artifact: ${summary.artifact}`);
  writeLine(`Job status: ${summary.jobStatus}`);
  if (summary.runStatus !== undefined)
    writeLine(`Run status: ${summary.runStatus}`);
  if (summary.leaseStatus !== undefined)
    writeLine(`Lease status: ${summary.leaseStatus}`);
}

export async function runConvexDemo(
  dependencies: ConvexDemoDependencies,
): Promise<ConvexDemoResult> {
  const runtime = dependencies.runtime ?? new FakeRuntimeAdapter();
  const writeLine = dependencies.writeLine ?? ((line) => console.log(line));
  const json = dependencies.json ?? false;
  const now = dependencies.now ?? Date.now;
  const token = dependencies.createToken ?? randomUUID;
  const targetJobId = dependencies.jobId ?? FIXTURE_JOB_ID;
  const leaseDurationMs =
    dependencies.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const stepDelayMs = dependencies.stepDelayMs ?? 0;
  if (
    !Number.isInteger(stepDelayMs) ||
    stepDelayMs < 0 ||
    stepDelayMs > 5_000
  ) {
    throw new ConvexDemoConfigurationError(
      'stepDelayMs must be an integer from 0 to 5000',
    );
  }
  const wait =
    dependencies.wait ??
    ((durationMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  const opportunities =
    await dependencies.coordinator.listAvailableOpportunities({
      executorType: 'plugin_host',
    });
  const opportunity = opportunities.find(
    ({ id }) =>
      id ===
      OpportunityIdSchema.parse(
        `opportunity_job-${targetJobId.slice('job_'.length)}`,
      ),
  );
  if (opportunity === undefined) {
    throw new RunnerError(
      'job_unavailable',
      `No compatible available opportunity matched ${targetJobId}. Seed or publish a compatible fixture through the configured coordinator deployment.`,
    );
  }
  const knownFixture = loadDemoFixtures();
  if (knownFixture.cause.id !== opportunity.cause.id) {
    throw new RunnerError(
      'fixture_cause_mismatch',
      `The Convex demo only supports the ${knownFixture.cause.id} fixture cause`,
    );
  }
  const fixture = {
    cause: knownFixture.cause,
    campaign: knownFixture.campaign,
    job: knownFixture.job,
  };
  const execution = await runDemo({
    coordinator: dependencies.coordinator,
    runtime,
    fixture,
    opportunity,
    ...(dependencies.nodeId === undefined
      ? {}
      : { nodeId: dependencies.nodeId }),
    ...(dependencies.approval === undefined
      ? {}
      : { approval: dependencies.approval }),
    ...(dependencies.promptForApproval === undefined
      ? {}
      : { promptForApproval: dependencies.promptForApproval }),
    leaseDurationMs,
    approvalExpiresInMs: Math.max(1_000, leaseDurationMs - 30_000),
    approvalId: ApprovalIdSchema.parse(`approval_${token()}`),
    artifactId: ArtifactIdSchema.parse(`artifact_${token()}`),
    sessionId: RuntimeSessionIdSchema.parse(`runtime-session_${token()}`),
    now,
    ...(dependencies.signal === undefined
      ? {}
      : { signal: dependencies.signal }),
    ...(dependencies.writeArtifact === undefined
      ? {}
      : { writeArtifact: dependencies.writeArtifact }),
    writeLine: json ? () => undefined : writeLine,
    ...(stepDelayMs === 0
      ? {}
      : {
          afterPersistedTransition: async () => wait(stepDelayMs),
        }),
  });
  const state = await dependencies.coordinator.getJobState({
    jobId: fixture.job.id,
  });
  const summary: ConvexDemoSummary = {
    status: execution.status,
    cause: fixture.cause.name,
    job: state.id,
    ...(state.run === undefined ? {} : { run: state.run.id }),
    runtime: 'runtime-fake',
    ...(state.acceptedArtifactId === undefined
      ? {}
      : { artifact: state.acceptedArtifactId }),
    jobStatus: state.status,
    ...(state.run === undefined ? {} : { runStatus: state.run.status }),
    ...(state.lease === undefined ? {} : { leaseStatus: state.lease.status }),
  };
  printSummary(summary, json, writeLine);
  return { execution, summary };
}
