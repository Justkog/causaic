# `@causaic/coordinator-convex`

Convex-backed implementation of the shared `JobCoordinator` interface. The
adapter validates every response with the shared protocol schemas and maps
stable backend failures to coordinator errors.

## Configuration

Applications pass explicit configuration to `ConvexJobCoordinator`, or load it
at their composition root with `loadConvexCoordinatorConfig(process.env)`:

- `CONVEX_URL`: URL of the target Convex deployment.
- `CAUSAIC_NODE_ID`: stable identity of this Causaic node.
- `CAUSAIC_DEV_NODE_SECRET`: development-node secret configured on the backend.
- `CAUSAIC_DEFAULT_LEASE_DURATION_MS`: positive lease duration, at most one
  hour.
  The package does not read environment variables below the configuration loader.
  The HTTP client is injectable, which keeps the reusable coordinator contract
  tests deterministic with `convex-test`.

## Tests

Run the in-memory backend contract suite with:

```sh
pnpm --filter @causaic/coordinator-convex test
```

The suite seeds a fresh Convex test database for each contract case. It covers
listing and exclusive acquisition, start/progress ordering, approvals,
artifacts, completion, and release/reavailability.

## Live smoke test

The live smoke test is deliberately opt-in. It seeds the development fixture,
lists it, acquires it, then releases it:

```sh
CAUSAIC_ENABLE_CONVEX_SMOKE_TEST=true \
CONVEX_URL=http://127.0.0.1:3210 \
CAUSAIC_NODE_ID=fixture-node-1 \
CAUSAIC_DEV_NODE_SECRET=local-development-secret \
CAUSAIC_DEFAULT_LEASE_DURATION_MS=60000 \
pnpm --filter @causaic/coordinator-convex smoke
```

This requires an already running and configured Convex development deployment.
The command rejects non-loopback URLs to avoid mutating an unknown deployment.
