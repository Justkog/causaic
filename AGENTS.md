# Causaic public repository guidance

This repository contains the public execution stack: the desktop app, runner,
plugins, portable protocol, runtime and coordinator packages, and example
workflows. The hosted web application, Convex implementation, and cloud policy
live in the sibling private `causaic-cloud` repository.

## Architecture rules

- `protocol` owns portable, validated messages and execution state.
- `runtime-core` owns provider-neutral runtime contracts.
- Runtime adapters, coordinators, runner code, plugins, and applications may
  depend on those public contracts.
- Shared packages must not import from applications.
- Public code must not import `@causaic/cloud-domain` or backend-generated APIs.
- Provider-specific types must not leak into portable protocol models.
- Cross-process and network messages must use runtime validation.
- Keep Convex IDs inside the adapter; shared interfaces use portable IDs.
- Prefer pure functions and explicit dependency injection.

The public coordinator contract describes the hosted service boundary. It does
not make the hosted implementation public.

## Development expectations

Before completing a task, run:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Keep ordinary tests offline and deterministic. Live Convex checks are opt-in.
Never commit credentials or development secrets.

Use Conventional Commits: `<type>[optional scope]: <description>`.
