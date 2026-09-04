import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ExecutorIdSchema,
  JobIdSchema,
  LeaseIdSchema,
  NodeIdSchema,
  OpportunityIdSchema,
  RunIdSchema,
} from '@causaic/protocol';
import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import { UserIdSchema } from '@causaic/protocol';
import { runnerCoreTestFixtures } from '@causaic/runner-core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { desktopDataPaths, openDesktopDatabase } from './database.js';
import { DesktopRepositories } from './repositories.js';
import { JournaledJobCoordinator } from './journaled-coordinator.js';

const temporaryDirectories: string[] = [];
const migrationsFolder = join(import.meta.dirname, '../../../drizzle');

async function openFixture() {
  const root = await mkdtemp(join(tmpdir(), 'causaic-desktop-db-'));
  temporaryDirectories.push(root);
  return openDesktopDatabase({
    paths: desktopDataPaths(root),
    migrationsFolder,
    now: () => 1_893_456_000_000,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('desktop persistence', () => {
  it('migrates once and preserves preferences across a reopen', async () => {
    const handle = await openFixture();
    const paths = handle.paths;
    const repositories = new DesktopRepositories(handle, () => 100);
    repositories.initialize(NodeIdSchema.parse('node_persistence-test'));
    repositories.setPaused(true);
    repositories.setLastSelectedView('execution');
    handle.close();

    const reopened = await openDesktopDatabase({ paths, migrationsFolder });
    const persisted = new DesktopRepositories(reopened).preferences();
    expect(reopened.schemaVersion).toBe(5);
    expect(persisted).toEqual({
      paused: true,
      lastSelectedView: 'execution',
    });
    reopened.close();
  });

  it('backs up and migrates a version-one database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'causaic-desktop-v1-'));
    temporaryDirectories.push(root);
    const firstMigrationFolder = join(root, 'migration-v1');
    await mkdir(join(firstMigrationFolder, 'meta'), { recursive: true });
    await copyFile(
      join(migrationsFolder, '0000_initial-local-state.sql'),
      join(firstMigrationFolder, '0000_initial-local-state.sql'),
    );
    await writeFile(
      join(firstMigrationFolder, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [
          {
            idx: 0,
            version: '6',
            when: 1_784_231_645_969,
            tag: '0000_initial-local-state',
            breakpoints: true,
          },
        ],
      }),
    );
    const paths = desktopDataPaths(join(root, 'data'));
    const versionOne = await openDesktopDatabase({
      paths,
      migrationsFolder: firstMigrationFolder,
      expectedSchemaVersion: 1,
    });
    versionOne.close();

    const migrated = await openDesktopDatabase({
      paths,
      migrationsFolder,
      now: () => 1_893_456_000_000,
    });
    expect(migrated.schemaVersion).toBe(5);
    expect(await readdir(paths.backups)).toHaveLength(1);
    migrated.close();
  });

  it('retains only the newest one hundred safe events', async () => {
    const handle = await openFixture();
    const repositories = new DesktopRepositories(handle, () => 200);
    repositories.initialize(NodeIdSchema.parse('node_persistence-test'));
    const execution = repositories.createExecution({
      jobId: JobIdSchema.parse('job_persistence-test'),
      nodeId: NodeIdSchema.parse('node_persistence-test'),
      executorId: ExecutorIdSchema.parse('executor_persistence-test'),
      runtimeType: 'fake',
      objective: 'Test durable event retention',
      campaignName: 'Test campaign',
      startedAt: 100,
    });
    for (let sequence = 0; sequence < 105; sequence += 1) {
      repositories.appendEvent({
        executionId: execution.id,
        sequence,
        type: 'progress',
        message: `Progress ${sequence}`,
        occurredAt: sequence,
      });
    }
    const events = repositories.events(execution.id);
    expect(events).toHaveLength(100);
    expect(events[0]?.sequence).toBe(5);
    expect(events.at(-1)?.sequence).toBe(104);
    handle.close();
  });

  it('atomically binds the concrete job when an opportunity is claimed', async () => {
    const handle = await openFixture();
    const repositories = new DesktopRepositories(handle, () => 200);
    const nodeId = NodeIdSchema.parse('node_claim-test');
    const executorId = ExecutorIdSchema.parse('executor_claim-test');
    repositories.initialize(nodeId);
    const coordinator = new MemoryJobCoordinator({
      fixtures: runnerCoreTestFixtures,
      now: () => 200,
      createId: () => 'claim-test',
    });
    const opportunity = (
      await coordinator.listAvailableOpportunities({
        executorType: 'plugin_host',
      })
    )[0];
    expect(opportunity).toBeDefined();
    const execution = repositories.createExecution({
      opportunityId: opportunity!.id,
      nodeId,
      executorId,
      runtimeType: 'fake',
      objective: opportunity!.objective ?? opportunity!.title,
      campaignName: opportunity!.campaign.name,
      startedAt: 200,
    });
    const journaled = new JournaledJobCoordinator(
      coordinator,
      repositories,
      execution.id,
    );

    const request = {
      opportunityId: opportunity!.id,
      leaseId: LeaseIdSchema.parse('lease_claim-test'),
      runId: RunIdSchema.parse('run_claim-test'),
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_claim-test'),
      executorType: 'plugin_host' as const,
      durationMs: 60_000,
    };
    const delegateClaim = coordinator.claimOpportunity.bind(coordinator);
    let delegateCalls = 0;
    coordinator.claimOpportunity = async (claimRequest) => {
      delegateCalls += 1;
      return delegateClaim(claimRequest);
    };
    const claimed = await journaled.claimOpportunity(request);

    expect(repositories.execution(execution.id)).toMatchObject({
      opportunityId: opportunity!.id,
      jobId: claimed.job.id,
      leaseId: claimed.lease.id,
      runId: claimed.lease.runId,
      lifecycleStatus: 'starting_run',
    });
    expect(repositories.unconfirmedOperations(execution.id)).toHaveLength(0);

    await expect(
      journaled.claimOpportunity({
        ...request,
        opportunityId: OpportunityIdSchema.parse('opportunity_job-other'),
        leaseId: LeaseIdSchema.parse('lease_claim-other'),
        runId: RunIdSchema.parse('run_claim-other'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(delegateCalls).toBe(1);
    expect(repositories.execution(execution.id)).toMatchObject({
      jobId: claimed.job.id,
      leaseId: claimed.lease.id,
      runId: claimed.lease.runId,
      lifecycleStatus: 'starting_run',
    });

    await expect(journaled.claimOpportunity(request)).resolves.toMatchObject({
      job: { id: claimed.job.id },
      lease: { id: claimed.lease.id, runId: claimed.lease.runId },
    });
    expect(delegateCalls).toBe(2);
    expect(repositories.execution(execution.id)?.lifecycleStatus).toBe(
      'starting_run',
    );
    handle.close();
  });
});
