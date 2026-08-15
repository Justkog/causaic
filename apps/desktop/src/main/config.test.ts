import { describe, expect, it } from 'vitest';

import { loadDesktopConfig } from './config.js';

const environment = {
  CAUSAIC_ENABLE_DESKTOP_DEVELOPMENT: 'true',
  CONVEX_URL: 'http://127.0.0.1:3210',
  CAUSAIC_NODE_ID: 'node_desktop-test',
  CAUSAIC_DEV_NODE_SECRET: 'test-secret',
  CAUSAIC_DEFAULT_LEASE_DURATION_MS: '60000',
};

describe('loadDesktopConfig', () => {
  it('accepts explicit loopback development configuration', () => {
    expect(loadDesktopConfig(environment)).toMatchObject({
      convexUrl: environment.CONVEX_URL,
      nodeExternalId: environment.CAUSAIC_NODE_ID,
      developmentSecret: environment.CAUSAIC_DEV_NODE_SECRET,
      defaultLeaseDurationMs: 60_000,
    });
  });

  it('rejects reachable deployments and disabled development mode', () => {
    expect(() =>
      loadDesktopConfig({ ...environment, CONVEX_URL: 'https://example.com' }),
    ).toThrow(/loopback/i);
    expect(() =>
      loadDesktopConfig({
        ...environment,
        CAUSAIC_ENABLE_DESKTOP_DEVELOPMENT: 'false',
      }),
    ).toThrow();
  });
});
