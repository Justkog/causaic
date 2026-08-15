import { describe, expect, it } from 'vitest';

import { loadConvexCoordinatorConfig } from '../src/config.js';

describe('loadConvexCoordinatorConfig', () => {
  it('loads and validates the required environment at the composition root', () => {
    expect(
      loadConvexCoordinatorConfig({
        CONVEX_URL: 'http://127.0.0.1:3210',
        CAUSAIC_NODE_ID: 'fixture-node-1',
        CAUSAIC_DEV_NODE_SECRET: 'development-secret',
        CAUSAIC_DEFAULT_LEASE_DURATION_MS: '60000',
      }),
    ).toMatchObject({
      nodeExternalId: 'fixture-node-1',
      defaultLeaseDurationMs: 60_000,
    });
  });

  it('rejects incomplete or unsafe configuration', () => {
    expect(() => loadConvexCoordinatorConfig({})).toThrow();
    expect(() =>
      loadConvexCoordinatorConfig({
        CONVEX_URL: 'http://127.0.0.1:3210',
        CAUSAIC_NODE_ID: 'fixture-node-1',
        CAUSAIC_DEV_NODE_SECRET: 'development-secret',
        CAUSAIC_DEFAULT_LEASE_DURATION_MS: '3600001',
      }),
    ).toThrow();
  });
});
