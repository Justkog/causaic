# Causaic

Causaic is an open-source execution stack for contributing spare AI-agent
capacity to useful work. This repository contains the contributor desktop app,
runner, agent plugins, portable execution protocol, runtime contracts, and
coordinator adapters.

The hosted web application and Convex backend are maintained privately in the
sibling `causaic-cloud` repository. Public clients communicate with that
service through the protocol and coordinator interfaces in this repository.

## Prerequisites

- Node.js 22 (see `.node-version`)
- Corepack, included with supported Node.js distributions

## Local setup

```bash
corepack enable
pnpm install
pnpm check
pnpm build
```

Run the deterministic runner example with:

```bash
pnpm causaic-runner demo --approval approve
```

The Convex coordinator smoke test and live demo are opt-in. Configure the
target deployment and node credentials as documented in
[`packages/coordinator-convex/README.md`](packages/coordinator-convex/README.md)
before running them.

## Desktop application

The development desktop app uses the same public coordinator contract and can
connect to a local deployment from the sibling private `causaic-cloud`
repository:

```bash
export CAUSAIC_ENABLE_DESKTOP_DEVELOPMENT=true
export CONVEX_URL=http://127.0.0.1:3210
export CAUSAIC_NODE_ID=node_local
export CAUSAIC_DEV_NODE_SECRET=your-development-secret
export CAUSAIC_DEFAULT_LEASE_DURATION_MS=300000

pnpm desktop:dev
```

Use `pnpm desktop:package` to create an unpacked application for the current
platform. See [`apps/desktop/README.md`](apps/desktop/README.md) for details.

## Useful commands

- `pnpm format` — format supported files
- `pnpm format:check` — check formatting
- `pnpm lint` — enforce code quality and public package boundaries
- `pnpm typecheck` — type-check every workspace
- `pnpm test` — run all unit tests
- `pnpm build` — build all workspaces
- `pnpm desktop:dev` — start the local Electron application
- `pnpm desktop:package` — build an unpacked current-platform application
- `pnpm plugins:check` — validate the public production plugin marketplaces
- `pnpm check` — run formatting, linting, type-checking, and tests

## Repository layout

- `apps/desktop` — local Electron contributor application
- `apps/runner` — executable runner and lifecycle demos
- `packages/protocol` — Zod schemas and cross-boundary message types
- `packages/runtime-core` — provider-neutral runtime contracts
- `packages/runtime-fake` — deterministic runtime adapter for tests and demos
- `packages/coordinator-core` — provider-neutral job coordinator contract
- `packages/coordinator-memory` — deterministic in-memory coordinator for tests
- `packages/coordinator-convex` — validated Convex coordinator client adapter
- `packages/runner-core` — runtime/coordinator execution orchestration
- `packages/workflow-schema` — portable workflow and JSON validation helpers
- `plugins` — contributor and operator agent plugins
- `fixtures/source-verification` — canonical source-verification development fixture
- `docs` — public execution architecture and plugin documentation

The hosted coordinator, authentication, MCP server implementation, and
deployment configuration are deliberately outside this repository.
