import { ConvexJobCoordinator } from '@causaic/coordinator-convex';
import { describe, expect, it } from 'vitest';

import { loadConvexDemoConfig, runConvexDemo } from './convex-demo.js';

const enabled = process.env.CAUSAIC_ENABLE_CONVEX_DEMO_TEST === 'true';

describe.skipIf(!enabled)('live Convex runner demo', () => {
  it('executes the seeded job through runtime-fake', async () => {
    const config = loadConvexDemoConfig(process.env);
    const result = await runConvexDemo({
      coordinator: new ConvexJobCoordinator(config.coordinator),
      ...(config.jobId === undefined ? {} : { jobId: config.jobId }),
      approval: 'approve',
      leaseDurationMs: config.coordinator.defaultLeaseDurationMs,
      writeLine: () => undefined,
      writeArtifact: async () => ({
        directory: '/tmp/causaic-convex-live-test',
        path: '/tmp/causaic-convex-live-test/source-verification.json',
      }),
    });

    expect(result.summary).toMatchObject({
      status: 'completed',
      jobStatus: 'completed',
      runStatus: 'completed',
      leaseStatus: 'released',
    });
  });
});
