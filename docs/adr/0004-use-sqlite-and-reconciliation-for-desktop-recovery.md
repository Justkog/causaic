# ADR 0004: SQLite and reconciliation for desktop recovery

**Status:** Accepted

## Context

Electron main previously kept preferences, execution history, approvals, and
artifact paths only in memory. A process or machine interruption therefore
lost the evidence needed to distinguish safe retries from conflicting remote
work. Convex must remain authoritative for shared lifecycle state, while local
recovery also needs transactions and committed forward migrations.

## Decision

Use `better-sqlite3` with `drizzle-orm` in Electron main. Generate and commit
forward-only migrations with `drizzle-kit`; production runs the bundled SQL
through Drizzle's migrator. SQLite stores local preferences, bounded safe
events, artifact metadata, operation intent, and recovery state. Convex remains
authoritative for jobs, leases, runs, approvals, artifact registration, and
terminal outcomes.

Recovery reconciles SQLite with portable, node-owned Convex projections before
retrying an idempotent operation. It never adopts foreign work and never claims
to resume a runtime process. An interrupted pending approval is presented only
as recovery context, with cleanup as the available action.

Artifacts use atomic, user-private files below Electron `userData`; SQLite
stores only opaque relative names and logical hashes. Active owned leases are
renewed while the application can safely act on them.

## Consequences

- Main-process restart preserves safe history and can finish already-produced
  artifacts when authoritative ownership still permits it.
- SQLite and Convex do not form one transaction; mutation intent and confirmed
  outcomes are journaled around remote calls and reconciled after uncertainty.
- `better-sqlite3` is a native Electron dependency and must be rebuilt for the
  Electron ABI. A separate application package owns the Electron production
  dependency and lockfile; repository tests retain an independent Node-targeted
  development copy. Electron-builder rebuilds only the isolated application
  tree, so no ABI restoration is needed. WSL/Linux and Windows use separate
  installs and user-data directories.
- Database encryption, runtime checkpoints, durable runtime continuation,
  daemon mode, and multi-node adoption remain out of scope.
