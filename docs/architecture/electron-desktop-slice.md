# Electron desktop vertical slice

## Purpose

The first desktop milestone proves that a contributor can discover an exact
local Convex offer, approve its start, execute it through runner-core and the
fake runtime, respond to an intermediate approval, cancel it, and observe a
terminal result from a secure Electron interface.

## Process and ownership

```text
sandboxed React renderer
        ↕ validated preload methods and snapshots
Electron main
  ├── revisioned renderer snapshot + SQLite repositories
  ├── five-second Convex offer monitor
  ├── one DesktopExecutionController
  ├── operation journal, recovery, and lease renewal
  ├── approval provider, durable artifacts, tray, and notifications
  └── in-process DesktopExecutionHost → runner-core → fake runtime
```

Main owns credentials, coordinator state, the running handle, approvals, local
artifact paths, and cancellation. The renderer owns only view selection and
transient dialogs. `DesktopExecutionHost` is the extraction seam for a future
utility process; it accepts an exact portable `JobOffer` and returns the
runner-core `RunningExecution` contract.

## IPC and state hydration

The preload exposes explicit methods for state hydration, refresh, start,
cancel, approval resolution, pause, controlled external links, quit, and two
subscriptions. It exposes no generic channel invocation.

Main pushes complete, Zod-validated `DesktopState` snapshots with a monotonic
revision. Renderer subscribes before calling `getState` and rejects older
snapshots, so a reload restores the active execution or pending approval
without replaying runtime events. The visible and persisted safe event list is
capped at 100 per execution. Pause, selected view, safe history, approvals,
artifacts, operation intent, and terminal results hydrate from SQLite after a
main-process restart.

No snapshot contains development secrets, provider/Convex IDs, raw runtime
events, local artifact paths, error causes, or cleanup errors.

## Lifecycle

Job discovery requests `desktop_node`-compatible work. A start is accepted only
when the backend is connected, the list is not stale, contribution is not
paused, the exact job remains cached, and no execution is active. Runner-core
owns leasing, run transitions, progress deduplication, approval persistence,
artifact validation/submission, completion, and failure cleanup.

All live renderer, tray, and quit cancellation paths call
`RunningExecution.cancel`.
The result promise is authoritative and creates exactly one completed,
cancelled, or failed recent result. Completion triggers an immediate job
refresh.

Closing hides the window. Confirmed quit cancels and waits without a forced
timeout. Active leases renew at a bounded fraction of their duration. Resume
and restart query ownership before further mutations.

## Persistence and interruption recovery

SQLite uses WAL, foreign keys, full synchronous writes, a busy timeout, and
committed Drizzle migrations. It is local authority only for preferences,
bounded safe history, artifact files and metadata, operation intent, and
recovery diagnostics. Convex remains shared lifecycle authority.

Important coordinator operations persist intent before the remote call and a
validated confirmation afterward. An uncertain call is queried before retry.
Startup discovers node-owned active work, reconciles it with incomplete local
rows, and applies only safe idempotent repairs. Foreign or conflicting work is
never adopted. Interrupted runtime execution is failed retryably or released;
only a verified persisted artifact may continue through submission and
completion. Pending approvals return as recovery-only context, not resumable
runtime work.

## Connection and notifications

The monitor refreshes immediately, every five seconds, after completion, on
manual request, and after system resume. A failed refresh retains last-known
offers with a stale warning. Invalid or non-loopback configuration produces a
failed-configuration state, while a native SQLite or migration failure produces
a distinct failed-local-storage state. Recovery runs after a successful
coordinator query without changing the connection result when reconciliation
itself fails.

The desktop uses electron-builder's two-package structure. Repository Node
tooling resolves the outer development dependency, while Electron resolves the
production dependency from an isolated `app/node_modules` installed with its
own lockfile. Development verifies SQLite with Electron after
`install-app-deps`; packaging lets electron-builder rebuild that same isolated
tree before staging. No restore step is required. Windows and WSL remain
separate installations of both dependency trees.

Pause blocks new starts and new-job notifications while continuing polling and
the active run. Main notifications are emitted only while the window is not
focused; clicking them focuses Jobs or Execution.

## Next milestone

Before real agent runtimes, move the execution host to an Electron utility
process or supervised bundled Node process and add authenticated device
identity plus keychain storage. Runtime checkpoints, database encryption,
concurrent capacity policy, installers, and auto-update remain deferred.
