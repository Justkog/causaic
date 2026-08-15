# ADR 0018: Defer workflow compatibility to contributors

- Status: accepted
- Date: 2026-07-20
- Supersedes: ADR 0015's execution-readiness split and ADR 0017's publication compatibility gate

## Decision

A workflow version is the provider-neutral source of truth for authored work.
Its input and output schemas, instructions, tool requirements, capability
manifest, approval policy, and optional validation task describe what the work
requires. Cause creator and operator APIs do not define execution profiles or
claim compatibility with a provider, host, or runtime.

Any structurally valid private draft may be published. Publication makes the
version immutable; it does not run a tool or runtime compatibility check. A
published private version may be selected only by workstreams belonging to its
owning cause. Platform catalog visibility remains a separate scope decision.

Available job offers include provider-neutral execution and validation
requirements derived from the pinned workflow version. The backend does not
filter those offers by runtime capability. Contributor clients will eventually
compare the requirements with their own capabilities before accepting work.
Contributor capability declaration, automatic matching, desktop behavior, MCP
transport, and skills instructions are outside this decision's implementation
scope.

The current managed-agent execution definition and package identity may remain
as a transitional adapter boundary for the held runner. They are not exposed as
creator-authored execution profiles and must not gate publication or workstream
association.

## Consequences

- Workflows with tools unsupported by the current embedded runner can still be
  published and associated with an owning-cause workstream.
- Catalog and workstream views show authored tool, capability, approval, and
  validation requirements instead of supported runtime claims.
- Job discovery returns lifecycle-eligible offers regardless of runtime and
  carries the workflow requirements needed for future contributor-side matching.
- The platform does not yet prevent an incapable contributor from attempting to
  accept an offer; that enforcement belongs to the future contributor boundary.
