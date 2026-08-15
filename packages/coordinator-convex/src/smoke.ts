import { ExecutorIdSchema, UserIdSchema } from '@causaic/protocol';
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
  const offers = await coordinator.listAvailableJobs({
    executorType: 'plugin_host',
  });
  const offer = offers[0];
  if (offer === undefined) {
    throw new Error('The seeded fixture job is not available.');
  }
  const lease = await coordinator.acquireLease({
    jobId: offer.job.id,
    nodeId: config.nodeExternalId,
    executorId: ExecutorIdSchema.parse('executor_smoke'),
    contributorId: UserIdSchema.parse('user_smoke'),
    executorType: 'plugin_host',
    durationMs: config.defaultLeaseDurationMs,
  });
  await coordinator.releaseLease({ leaseId: lease.id });
  process.stdout.write(
    `${JSON.stringify({ ok: true, jobId: offer.job.id, leaseId: lease.id })}\n`,
  );
}

await main();
