import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import {
  ExecutorIdSchema,
  JobIdSchema,
  NodeIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import { runnerCoreTestFixtures } from '@causaic/runner-core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import {
  desktopDataPaths,
  openDesktopDatabase,
} from '../persistence/database.js';
import { DesktopRepositories } from '../persistence/repositories.js';
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
    const lease = await coordinator.acquireLease({
      jobId,
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_recovery-test'),
      executorType: 'plugin_host',
      durationMs: 60_000,
    });
    await coordinator.startRun({
      jobId,
      leaseId: lease.id,
      runId: lease.runId,
    });
    const local = repositories.createExecution({
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
});
