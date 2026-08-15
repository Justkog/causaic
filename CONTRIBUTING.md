# Contributing

Install Node.js 22 and run `pnpm install` from the repository root.

Before opening a change, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Keep public packages independent from the hosted `causaic-cloud` repository.
Portable execution behavior belongs in `protocol`; hosted policy does not.
Use deterministic tests for ordinary changes and keep live Convex checks
opt-in. Do not commit credentials, deployment secrets, or local environment
files.
