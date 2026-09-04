import { MemoryJobCoordinator } from '@causaic/coordinator-memory';
import {
  ExecutorIdSchema,
  NodeIdSchema,
  JobDefinitionSchema,
  UserIdSchema,
} from '@causaic/protocol';
import { runnerCoreTestFixtures } from '@causaic/runner-core/testing';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import { describe, expect, it } from 'vitest';

import { ElectronApprovalProvider } from './approval-provider.js';
import { BackendMonitor } from './backend-monitor.js';
import { DesktopExecutionController } from './execution-controller.js';
import { InProcessExecutionHost } from './execution-host.js';
import { DesktopStateStore } from './state.js';

function waitForState(
  state: DesktopStateStore,
  predicate: (value: ReturnType<DesktopStateStore['get']>) => boolean,
) {
  if (predicate(state.get())) return Promise.resolve(state.get());
  return new Promise<ReturnType<DesktopStateStore['get']>>((resolve) => {
    const unsubscribe = state.subscribe((value) => {
      if (!predicate(value)) return;
      unsubscribe();
      resolve(value);
    });
  });
}

function fixture() {
  let id = 0;
  const coordinator = new MemoryJobCoordinator({
    now: () => Date.parse('2030-01-01T12:00:00Z'),
    createId: () => `desktop-test-${id++}`,
    fixtures: {
      campaigns: runnerCoreTestFixtures.campaigns,
      jobs: runnerCoreTestFixtures.jobs.map((job) =>
        JobDefinitionSchema.parse({
          ...job,
          supportedExecutorTypes: ['desktop_node', 'plugin_host'],
        }),
      ),
      workflowDefinitions: runnerCoreTestFixtures.workflowDefinitions,
    },
  });
  const state = new DesktopStateStore();
  const monitor = new BackendMonitor({ coordinator, state });
  const controllerReference: { current?: DesktopExecutionController } = {};
  const approvalProvider = new ElectronApprovalProvider((request) =>
    controllerReference.current?.setPendingApproval(request),
  );
  const host = new InProcessExecutionHost({
    coordinator,
    nodeId: NodeIdSchema.parse('node_desktop-test'),
    runtime: new FakeRuntimeAdapter(),
    approvalProvider,
    artifactStore: {
      persist: async () => ({
        directory: '/private',
        path: '/private/output.json',
      }),
    },
    executorId: ExecutorIdSchema.parse('executor_desktop-test'),
    contributorId: UserIdSchema.parse('user_desktop-test'),
    leaseDurationMs: 60_000,
    now: () => Date.parse('2030-01-01T12:00:00Z'),
    createId: () => `desktop-${id++}`,
  });
  const controller = new DesktopExecutionController({
    state,
    monitor,
    host,
    approvalProvider,
    now: () => Date.parse('2030-01-01T12:00:00Z'),
  });
  controllerReference.current = controller;
  return { approvalProvider, controller, monitor, state };
}

describe('DesktopExecutionController', () => {
  it('runs one exact opportunity and exposes no local artifact path', async () => {
    const { controller, monitor, state } = fixture();
    await monitor.refresh();
    const opportunity = state.get().availableOpportunities[0];
    expect(opportunity).toBeDefined();
    await controller.start(opportunity!.id);
    const pending = await waitForState(
      state,
      (value) => value.currentExecution?.pendingApproval !== undefined,
    );
    controller.resolveApproval({
      approvalId: pending.currentExecution!.pendingApproval!.id,
      decision: 'approved',
    });
    const completed = await waitForState(
      state,
      (value) => value.recentExecution?.status === 'completed',
    );
    expect(completed.currentExecution).toBeNull();
    expect(completed.recentExecution?.artifact?.content).toMatchObject({
      verdict: 'supported',
    });
    expect(JSON.stringify(completed)).not.toContain('/private');
    expect(completed.recentExecution).not.toHaveProperty('cause');
  });

  it('rejects a duplicate start and cancels through the running handle', async () => {
    const { controller, monitor, state } = fixture();
    await monitor.refresh();
    const opportunity = state.get().availableOpportunities[0]!;
    await controller.start(opportunity.id);
    await expect(controller.start(opportunity.id)).rejects.toThrow(
      /already active/i,
    );
    await waitForState(
      state,
      (value) => value.currentExecution?.pendingApproval !== undefined,
    );
    await controller.cancel('Test cancellation');
    expect(state.get().recentExecution).toMatchObject({
      status: 'cancelled',
      message: 'Test cancellation',
    });
    expect(await controller.cancel()).toEqual(state.get());
  });
});
