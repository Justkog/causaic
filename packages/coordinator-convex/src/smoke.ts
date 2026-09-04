import {
  ExecutorIdSchema,
  LeaseIdSchema,
  RunIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import { makeFunctionReference } from 'convex/server';

import { createConvexCoordinatorClient } from './client.js';
import { loadConvexCoordinatorConfig } from './config.js';
import { ConvexJobCoordinator } from './convex-job-coordinator.js';

async function main(): Promise<void> {
  if (process.env.CAUSAIC_ENABLE_CONVEX_SMOKE_TEST !== 'true') {
    throw new Error(
      'Set CAUSAIC_ENABLE_CONVEX_SMOKE_TEST=true to run the live Convex smoke test.',
    );
  }
  const config = loadConvexCoordinatorConfig(process.env);
  const host = new URL(config.convexUrl).hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
    throw new Error('The Convex smoke test only accepts a loopback URL.');
  }
  const client = createConvexCoordinatorClient(config.convexUrl);
  const seed = makeFunctionReference<
    'mutation',
    { developmentSecret: string },
    unknown
  >('seed:seedVerticalSliceForDevelopment');
  await client.mutation(seed, {
    developmentSecret: config.developmentSecret,
  });

  const coordinator = new ConvexJobCoordinator(config, client);
  const opportunities = await coordinator.listAvailableOpportunities({
    executorType: 'plugin_host',
  });
  const opportunity = opportunities[0];
  if (opportunity === undefined) {
    throw new Error('The seeded fixture job is not available.');
  }
  const claimed = await coordinator.claimOpportunity({
    opportunityId: opportunity.id,
    leaseId: LeaseIdSchema.parse('lease_smoke'),
    runId: RunIdSchema.parse('run_smoke'),
    nodeId: config.nodeExternalId,
    executorId: ExecutorIdSchema.parse('executor_smoke'),
    contributorId: UserIdSchema.parse('user_smoke'),
    executorType: 'plugin_host',
    durationMs: config.defaultLeaseDurationMs,
  });
  await coordinator.releaseLease({ leaseId: claimed.lease.id });
  process.stdout.write(
    `${JSON.stringify({ ok: true, jobId: claimed.job.id, leaseId: claimed.lease.id })}\n`,
  );
}

await main();
