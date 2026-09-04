import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import {
  ExecutorIdSchema,
  JobIdSchema,
  LeaseIdSchema,
  NodeIdSchema,
  RunIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import { runnerCoreTestFixtures } from '@causaic/runner-core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import {
  desktopDataPaths,
  openDesktopDatabase,
} from '../persistence/database.js';
import { DesktopRepositories } from '../persistence/repositories.js';
import { JournaledJobCoordinator } from '../persistence/journaled-coordinator.js';
import { DesktopStateStore } from '../state.js';
import { DesktopRecoveryService } from './recovery-service.js';

const temporaryDirectories: string[] = [];
const now = Date.parse('2030-01-01T12:00:00Z');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('DesktopRecoveryService', () => {
  it('replays a committed claim with the same identities after the response is lost', async () => {
    const root = await mkdtemp(join(tmpdir(), 'causaic-recovery-claim-'));
    temporaryDirectories.push(root);
    const handle = await openDesktopDatabase({
      paths: desktopDataPaths(root),
      migrationsFolder: join(import.meta.dirname, '../../../drizzle'),
      now: () => now,
    });
    const nodeId = NodeIdSchema.parse('node_recovery-claim-test');
    const executorId = ExecutorIdSchema.parse('executor_recovery-claim-test');
    const contributorId = UserIdSchema.parse('user_recovery-claim-test');
    const repositories = new DesktopRepositories(handle, () => now);
    repositories.initialize(nodeId);
    const coordinator = new MemoryJobCoordinator({
      now: () => now,
      createId: () => 'recovery-claim',
      fixtures: runnerCoreTestFixtures,
    });
    const opportunity = (
      await coordinator.listAvailableOpportunities({
        executorType: 'desktop_node',
      })
    )[0];
    expect(opportunity).toBeDefined();
    const local = repositories.createExecution({
      opportunityId: opportunity!.id,
      nodeId,
      executorId,
      runtimeType: 'fake',
      objective: opportunity!.objective ?? opportunity!.title,
      campaignName: opportunity!.campaign.name,
      startedAt: now,
    });
    const originalClaim = coordinator.claimOpportunity.bind(coordinator);
    let loseResponse = true;
    coordinator.claimOpportunity = async (request) => {
      const result = await originalClaim(request);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('simulated lost response');
      }
      return result;
    };
    const journaled = new JournaledJobCoordinator(
      coordinator,
      repositories,
      local.id,
    );
    await expect(
      journaled.claimOpportunity({
        opportunityId: opportunity!.id,
        leaseId: LeaseIdSchema.parse('lease_recovery-claim-test'),
        runId: RunIdSchema.parse('run_recovery-claim-test'),
        nodeId,
        executorId,
        contributorId,
        executorType: 'desktop_node',
        durationMs: 60_000,
      }),
    ).rejects.toThrow('simulated lost response');
    expect(repositories.execution(local.id)).toMatchObject({
      opportunityId: opportunity!.id,
      jobId: null,
      leaseId: null,
      runId: null,
    });
    const recovery = new DesktopRecoveryService({
      coordinator,
      repositories,
      state: new DesktopStateStore(),
      nodeId,
      executorId,
      contributorId,
      leaseDurationMs: 60_000,
      artifactRoot: handle.paths.artifacts,
      now: () => now,
    });

    await expect(recovery.recoverOnStartup()).resolves.toMatchObject({
      recoveredExecutions: 1,
      issues: [],
    });
    expect(repositories.execution(local.id)).toMatchObject({
      jobId: JobIdSchema.parse('job_runner-core-test'),
      leaseId: 'lease_recovery-claim-test',
      runId: 'run_recovery-claim-test',
      lifecycleStatus: 'interrupted',
    });
    handle.close();
  });

  it('fails an interrupted active run retryably and is idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'causaic-recovery-'));
    temporaryDirectories.push(root);
    const handle = await openDesktopDatabase({
      paths: desktopDataPaths(root),
      migrationsFolder: join(import.meta.dirname, '../../../drizzle'),
      now: () => now,
    });
    const nodeId = NodeIdSchema.parse('node_recovery-test');
    const executorId = ExecutorIdSchema.parse('executor_recovery-test');
    const repositories = new DesktopRepositories(handle, () => now);
    repositories.initialize(nodeId);
    let nextId = 0;
    const coordinator = new MemoryJobCoordinator({
      fixtures: runnerCoreTestFixtures,
      now: () => now,
      createId: () => `recovery-${nextId++}`,
    });
    const jobId = JobIdSchema.parse('job_runner-core-test');
    const opportunity = (
      await coordinator.listAvailableOpportunities({
        executorType: 'plugin_host',
      })
    ).find(({ id }) => id.endsWith(jobId.slice('job_'.length)));
    expect(opportunity).toBeDefined();
    const claimed = await coordinator.claimOpportunity({
      opportunityId: opportunity!.id,
      leaseId: LeaseIdSchema.parse('lease_recovery-test'),
      runId: RunIdSchema.parse('run_recovery-test'),
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_recovery-test'),
      executorType: 'plugin_host',
      durationMs: 60_000,
    });
    const lease = claimed.lease;
    await coordinator.startRun({
      jobId,
      leaseId: lease.id,
      runId: lease.runId,
    });
    const local = repositories.createExecution({
      opportunityId: opportunity!.id,
      jobId,
      nodeId,
      executorId,
      runtimeType: 'fake',
      objective: 'Recover the interrupted run',
      campaignName: 'Recovery campaign',
      startedAt: now,
    });
    repositories.bindLease(local.id, lease.id, lease.runId);
    const recovery = new DesktopRecoveryService({
      coordinator,
      repositories,
      state: new DesktopStateStore(),
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_recovery-test'),
      leaseDurationMs: 60_000,
      artifactRoot: handle.paths.artifacts,
      now: () => now,
    });

    await expect(recovery.recoverOnStartup()).resolves.toEqual({
      recoveredExecutions: 1,
      issues: [],
    });
    expect(repositories.execution(local.id)?.lifecycleStatus).toBe(
      'interrupted',
    );
    expect((await coordinator.getJobState({ jobId })).status).toBe('available');
    await expect(recovery.recoverOnStartup()).resolves.toEqual({
      recoveredExecutions: 0,
      issues: [],
    });
    handle.close();
  });

  it('does not adopt an ambiguous remote claim as a second local execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'causaic-recovery-ambiguous-'));
    temporaryDirectories.push(root);
    const handle = await openDesktopDatabase({
      paths: desktopDataPaths(root),
      migrationsFolder: join(import.meta.dirname, '../../../drizzle'),
      now: () => now,
    });
    const nodeId = NodeIdSchema.parse('node_recovery-ambiguous-test');
    const executorId = ExecutorIdSchema.parse(
      'executor_recovery-ambiguous-test',
    );
    const repositories = new DesktopRepositories(handle, () => now);
    repositories.initialize(nodeId);
    const coordinator = new MemoryJobCoordinator({
      fixtures: runnerCoreTestFixtures,
      now: () => now,
      createId: () => 'recovery-ambiguous',
    });
    const opportunity = (
      await coordinator.listAvailableOpportunities({
        executorType: 'plugin_host',
      })
    )[0];
    expect(opportunity).toBeDefined();
    const claimed = await coordinator.claimOpportunity({
      opportunityId: opportunity!.id,
      leaseId: LeaseIdSchema.parse('lease_recovery-ambiguous-test'),
      runId: RunIdSchema.parse('run_recovery-ambiguous-test'),
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_recovery-ambiguous-test'),
      executorType: 'plugin_host',
      durationMs: 60_000,
    });
    const local = repositories.createExecution({
      opportunityId: opportunity!.id,
      nodeId,
      executorId,
      runtimeType: 'fake',
      objective: opportunity!.objective ?? opportunity!.title,
      campaignName: opportunity!.campaign.name,
      startedAt: now,
    });
    const state = new DesktopStateStore();
    const recovery = new DesktopRecoveryService({
      coordinator,
      repositories,
      state,
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_recovery-ambiguous-test'),
      leaseDurationMs: 60_000,
      artifactRoot: handle.paths.artifacts,
      now: () => now,
    });

    await expect(recovery.recoverOnStartup()).resolves.toMatchObject({
      recoveredExecutions: 0,
      issues: [expect.stringContaining(opportunity!.id)],
    });
    expect(repositories.incompleteExecutions()).toHaveLength(1);
    expect(repositories.execution(local.id)?.recoveryStatus).toBe(
      'attention_required',
    );
    expect(state.get().recovery.status).toBe('attention_required');
    expect(claimed.job.id).not.toBe(repositories.execution(local.id)?.jobId);
    handle.close();
  });
});
