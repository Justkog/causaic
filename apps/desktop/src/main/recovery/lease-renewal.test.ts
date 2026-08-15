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
import { LeaseRenewalService, type RenewalScheduler } from './lease-renewal.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('LeaseRenewalService', () => {
  it('renews an owned lease with an injected scheduler', async () => {
    let now = Date.parse('2030-01-01T12:00:00Z');
    let scheduled:
      { operation: () => void | Promise<void>; delayMs: number } | undefined;
    const scheduler: RenewalScheduler = {
      schedule: (operation, delayMs) => {
        scheduled = { operation, delayMs };
        return scheduled;
      },
      cancel: () => undefined,
    };
    const root = await mkdtemp(join(tmpdir(), 'causaic-renewal-'));
    temporaryDirectories.push(root);
    const handle = await openDesktopDatabase({
      paths: desktopDataPaths(root),
      migrationsFolder: join(import.meta.dirname, '../../../drizzle'),
    });
    const nodeId = NodeIdSchema.parse('node_renewal-test');
    const executorId = ExecutorIdSchema.parse('executor_renewal-test');
    const jobId = JobIdSchema.parse('job_runner-core-test');
    const repositories = new DesktopRepositories(handle, () => now);
    repositories.initialize(nodeId);
    let nextId = 0;
    const coordinator = new MemoryJobCoordinator({
      fixtures: runnerCoreTestFixtures,
      now: () => now,
      createId: () => `renewal-${nextId++}`,
    });
    const lease = await coordinator.acquireLease({
      jobId,
      nodeId,
      executorId,
      contributorId: UserIdSchema.parse('user_renewal-test'),
      executorType: 'plugin_host',
      durationMs: 120_000,
    });
    const execution = repositories.createExecution({
      jobId,
      nodeId,
      executorId,
      runtimeType: 'fake',
      objective: 'Renew the test lease',
      campaignName: 'Renewal campaign',
      startedAt: now,
    });
    repositories.bindLease(execution.id, lease.id, lease.runId);
    const renewal = new LeaseRenewalService({
      coordinator,
      repositories,
      nodeId,
      durationMs: 120_000,
      now: () => now,
      scheduler,
    });

    await renewal.start(execution.id, lease.id, () => undefined);
    expect(scheduled?.delayMs).toBe(40_000);
    now += 40_000;
    await scheduled?.operation();
    const renewed = (
      await coordinator.getRecoverySnapshot({ jobId })
    ).leases.find(({ id }) => id === lease.id);
    expect(renewed?.heartbeatAt).toBe(new Date(now).toISOString());
    expect(renewed?.expiresAt).toBe(new Date(now + 120_000).toISOString());
    renewal.stop();
    handle.close();
  });
});
