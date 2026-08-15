# ADR 0032: Keep execution contracts public and cloud policy private

- Status: accepted
- Date: 2026-08-15

## Context

Causaic will publish the desktop app, runner, plugins, and provider-neutral
execution packages while keeping the hosted Convex backend private. The former
`domain` package mixed portable execution state with hosted campaign and
workflow policy, which made the repository boundary difficult to extract.

## Decision

- `packages/protocol` owns portable job, lease, run, approval, cancellation,
  retry, and failure schemas and types.
- `packages/cloud-domain` contains hosted campaign, contributor, workflow, and
  backend policy. It is private and may depend on `protocol`; public packages
  and applications must not import it.
- `runtime-core` exposes runtime capability checks through
  `AgentRuntimeAdapter.supports(installation, task)`. Runtime-specific
  compatibility stays with each adapter.
- `coordinator-memory` remains a public, deterministic test coordinator. It
  implements the public protocol directly and is not a source of hosted policy
  truth.
- `coordinator-convex` validates its assembled public job state with the
  protocol schema before returning it to callers.

## Consequences

The future public repository can retain the protocol, coordinator contracts,
runtime adapters, runner, desktop app, and test coordinator without exposing
hosted campaign or workflow policy. The private repository keeps
`cloud-domain` and the backend application. Any policy needed by a public
client must first be represented as an explicit provider-neutral protocol
contract rather than imported from the private package.
