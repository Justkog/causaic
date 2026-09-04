import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { JobCoordinator } from '@causaic/coordinator-core';
import {
  ApprovalIdSchema,
  ArtifactIdSchema,
  CampaignSchema,
  CauseSchema,
  OpportunityIdSchema,
  ExecutorIdSchema,
  MessageIdSchema,
  NodeIdSchema,
  JobDefinitionSchema,
  LeaseIdSchema,
  RunIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import type {
  ApprovalId,
  ArtifactId,
  Campaign,
  Cause,
  ContributionOpportunitySummary,
  JobState,
  JsonValue,
  JobDefinition,
} from '@causaic/protocol';
import {
  LocalRunnerService,
  WorkflowArtifactValidator,
} from '@causaic/runner-core';
import type {
  ArtifactOutput,
  RunnerEvent,
  RunnerIdFactory,
} from '@causaic/runner-core';
import { RuntimeSessionIdSchema } from '@causaic/runtime-core';
import type {
  AgentRuntimeAdapter,
  RuntimeApprovalRequest,
  RuntimeSessionId,
} from '@causaic/runtime-core';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';

import { loadDemoFixtures } from './fixtures.js';

export type InjectedApproval = 'approve' | 'deny';

export interface DemoFixture {
  readonly cause: Cause;
  readonly campaign: Campaign;
  readonly job: JobDefinition;
}

export type ArtifactWriter = (artifact: JsonValue) => Promise<ArtifactOutput>;

export type DemoPersistedTransition =
  | 'lease_acquired'
  | 'run_started'
  | 'progress_reported'
  | 'approval_requested'
  | 'approval_resolved'
  | 'artifact_submitted'
  | 'run_completed'
  | 'lease_released'
  | 'run_failed';

export interface DemoDependencies {
  readonly coordinator: JobCoordinator;
  readonly runtime?: AgentRuntimeAdapter;
  readonly fixture?: DemoFixture;
  readonly opportunity?: ContributionOpportunitySummary;
  readonly approval?: InjectedApproval;
  readonly promptForApproval?: (
    request: RuntimeApprovalRequest,
  ) => Promise<InjectedApproval>;
  readonly writeLine?: (line: string) => void;
  readonly writeArtifact?: ArtifactWriter;
  readonly signal?: AbortSignal;
  readonly nodeId?: ReturnType<typeof NodeIdSchema.parse>;
  readonly now?: () => number;
  readonly leaseDurationMs?: number;
  readonly approvalExpiresInMs?: number;
  readonly approvalId?: ApprovalId;
  readonly artifactId?: ArtifactId;
  readonly sessionId?: RuntimeSessionId;
  readonly afterPersistedTransition?: (
    transition: DemoPersistedTransition,
  ) => Promise<void>;
}

export type DemoResult =
  | {
      readonly status: 'completed';
      readonly job: JobState;
      readonly artifact: JsonValue;
      readonly output: ArtifactOutput;
    }
  | { readonly status: 'cancelled'; readonly job?: JobState }
  | {
      readonly status: 'failed';
      readonly job: JobState;
      readonly code: string;
      readonly message: string;
    };

export class RunnerError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RunnerError';
  }
}

export async function writeArtifactToTemporaryDirectory(
  artifact: JsonValue,
): Promise<ArtifactOutput> {
  const directory = await mkdtemp(join(tmpdir(), 'causaic-runner-'));
  const path = join(directory, 'source-verification.json');
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return { directory, path };
}

function transitionFor(
  event: RunnerEvent,
): DemoPersistedTransition | undefined {
  switch (event.type) {
    case 'lease.acquired':
      return 'lease_acquired';
    case 'run.started':
      return 'run_started';
    case 'phase.changed':
    case 'progress':
      return 'progress_reported';
    case 'approval.requested':
      return 'approval_requested';
    case 'approval.resolved':
      return 'approval_resolved';
    case 'artifact.submitted':
      return 'artifact_submitted';
    case 'execution.completed':
      return 'run_completed';
    case 'execution.cancelled':
      return 'lease_released';
    case 'execution.failed':
      return 'run_failed';
    default:
      return undefined;
  }
}

export async function runDemo(
  dependencies: DemoDependencies,
): Promise<DemoResult> {
  const suppliedFixture = dependencies.fixture ?? loadDemoFixtures();
  const fixture = {
    cause: CauseSchema.parse(suppliedFixture.cause),
    campaign: CampaignSchema.parse(suppliedFixture.campaign),
    job: JobDefinitionSchema.parse(suppliedFixture.job),
  };
  if (fixture.campaign.status !== 'active')
    throw new RunnerError(
      'domain_campaign_not_active',
      `Campaign ${fixture.campaign.id} is not active`,
    );

  const runtime = dependencies.runtime ?? new FakeRuntimeAdapter();
  const writeLine =
    dependencies.writeLine ?? ((line) => process.stdout.write(`${line}\n`));
  const now = dependencies.now ?? Date.now;
  const writeArtifact =
    dependencies.writeArtifact ?? writeArtifactToTemporaryDirectory;
  const opportunityId = OpportunityIdSchema.parse(
    `opportunity_job-${fixture.job.id.slice('job_'.length)}`,
  );
  writeLine(`Cause: ${fixture.cause.name}`);
  writeLine(`Campaign: ${fixture.campaign.name}`);
  writeLine(`Opportunity: ${opportunityId.replace(/^opportunity_job-/, '')}`);

  const opportunities =
    dependencies.opportunity === undefined
      ? await dependencies.coordinator.listAvailableOpportunities({
          executorType: 'plugin_host',
        })
      : [dependencies.opportunity];
  const opportunity = opportunities.find(({ id }) => id === opportunityId);
  if (opportunity === undefined)
    throw new RunnerError(
      'job_unavailable',
      `Job ${fixture.job.id} is unavailable`,
    );
  const [installation] = await runtime.detect();
  if (installation === undefined || !installation.available)
    throw new RunnerError('runtime_unavailable', 'No available runtime found');
  writeLine(`Runtime: ${installation.displayName}`);
  writeLine('');

  const ids: RunnerIdFactory = {
    approvalId: () =>
      dependencies.approvalId ?? ApprovalIdSchema.parse('approval_runner-demo'),
    artifactId: () =>
      dependencies.artifactId ?? ArtifactIdSchema.parse('artifact_runner-demo'),
    sessionId: () =>
      dependencies.sessionId ??
      RuntimeSessionIdSchema.parse('runtime-session_runner-demo'),
    messageId: (purpose, sequence) =>
      MessageIdSchema.parse(
        `message_runner-${purpose}${sequence === undefined ? '' : `-${sequence}`}`,
      ),
  };
  const service = new LocalRunnerService({
    coordinator: dependencies.coordinator,
    runtime,
    approvalProvider: {
      requestDecision: async (request) => {
        const decision =
          dependencies.approval ??
          (await dependencies.promptForApproval?.(request));
        if (decision === undefined)
          throw new RunnerError(
            'approval_input_unavailable',
            'Approval requires a terminal or --approval approve|deny',
          );
        return decision === 'approve'
          ? { decision: 'approved' as const }
          : {
              decision: 'denied' as const,
              reason: 'User denied example.gov access',
            };
      },
    },
    artifactValidator: new WorkflowArtifactValidator(),
    artifactStore: {
      persist: async (_artifactId, artifact) => writeArtifact(artifact),
    },
    ids,
    now,
    afterEvent: async (event) => {
      const transition = transitionFor(event);
      if (transition !== undefined)
        await dependencies.afterPersistedTransition?.(transition);
    },
  });
  const running = service.start({
    opportunity,
    leaseId: LeaseIdSchema.parse(
      `lease_runner-demo-${(dependencies.nodeId ?? NodeIdSchema.parse('node_runner-demo')).slice('node_'.length)}`,
    ),
    runId: RunIdSchema.parse(
      `run_runner-demo-${(dependencies.nodeId ?? NodeIdSchema.parse('node_runner-demo')).slice('node_'.length)}`,
    ),
    installation,
    executorId: ExecutorIdSchema.parse('executor_runner-demo'),
    nodeId: dependencies.nodeId ?? NodeIdSchema.parse('node_runner-demo'),
    contributorId: UserIdSchema.parse('user_runner-demo'),
    executorType: 'plugin_host',
    leaseDurationMs: dependencies.leaseDurationMs ?? 60 * 60_000,
    approvalExpiresInMs: dependencies.approvalExpiresInMs ?? 28 * 60_000,
    ...(dependencies.signal === undefined
      ? {}
      : { signal: dependencies.signal }),
  });

  let phase: 'preparing' | 'running' | 'validating' = 'preparing';
  const render = (async () => {
    for await (const event of running.events) {
      switch (event.type) {
        case 'phase.changed':
          phase = event.phase;
          if (event.phase === 'preparing')
            writeLine('[preparing] Preparing workspace');
          break;
        case 'progress':
          writeLine(
            `[${phase === 'validating' ? 'running' : 'preparing'}] ${event.message}`,
          );
          break;
        case 'approval.resolved':
          if (dependencies.approval !== undefined)
            writeLine(
              `[approval] Allow access to example.gov? ${event.decision}`,
            );
          break;
        case 'artifact.produced':
          writeLine(`[artifact] Created ${basename(event.output.path)}`);
          break;
        case 'execution.completed':
          writeLine('[completed] 1 claim checked, 0 warnings');
          break;
        case 'execution.cancelled':
          writeLine(
            `[cancelled] ${event.reason.includes('denied') ? 'Access to example.gov denied' : event.reason}`,
          );
          break;
        case 'execution.failed':
          writeLine(`[failed] ${event.message}`);
          break;
      }
    }
  })();
  const result = await running.result;
  await render;

  if (result.status === 'completed') {
    writeLine(`[output] ${result.output.directory}`);
    return {
      status: 'completed',
      job: result.job,
      artifact: result.artifact,
      output: result.output,
    };
  }
  if (result.status === 'cancelled')
    return {
      status: 'cancelled',
      job:
        result.job ??
        (await dependencies.coordinator.getJobState({ jobId: fixture.job.id })),
    };
  const job =
    result.job ??
    (await dependencies.coordinator.getJobState({ jobId: fixture.job.id }));
  return {
    status: 'failed',
    job,
    code: result.error.code,
    message: result.error.message,
  };
}

export type { ArtifactOutput };
