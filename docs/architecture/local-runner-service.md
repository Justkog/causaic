# Reusable local runner service

## Scope

`@causaic/runner-core` is the provider-neutral in-process boundary for one
caller-selected execution. The caller discovers jobs, applies eligibility and
scheduling policy, selects a runtime installation, and passes one exact
`JobOffer` to the service. The package does not construct coordinators or
runtimes and does not read environment variables.

This milestone does not choose an Electron utility process or a daemon. It adds
no runner registry, capacity scheduler, lease renewal, checkpoints, SQLite, IPC,
or real runtime adapter.

## Dependency boundary

```text
protocol
├── coordinator-core + runtime-core
│    ↓
│  runner-core
│    ↓
│  apps/runner + apps/desktop
│       ├── coordinator-memory / coordinator-convex
│       └── runtime-fake
```

`runner-core` imports only provider-neutral interfaces. Terminal prompts,
filesystem selection, fixture discovery, environment validation, output
formatting, and Convex construction remain in `apps/runner`.

## Execution contract

`RunnerService.start()` returns a `RunningExecution` with an ordered local
event stream, a terminal result promise, and idempotent cancellation. The
result always resolves as `completed`, `cancelled`, or `failed`; operational
failures are represented by `RunnerExecutionError` with a stable code,
lifecycle stage, retryability, safe message, original cause, and optional
cleanup error.

Each execution owns its `AbortController`. Cancellation reaches the approval
provider and runtime through `AbortSignal`, waits for authoritative cleanup,
and emits exactly one terminal event. Caller and runtime cancellation release
unfinished work for reassignment. Approval denial remains an expected
cancellation and uses the existing approval transition.

## Local events and progress

Events are buffered until their single consumer starts and receive a local
monotonic sequence. The stream closes after exactly one of
`execution.completed`, `execution.cancelled`, or `execution.failed`. It is not
durable and offers no process-level replay.

Raw runtime events do not escape the service. Runtime sequence numbers remain
the coordinator progress ordering key. Exact replays and stale events are
ignored, conflicting duplicate sequences fail the workflow, and consecutive
duplicate phases or messages do not produce coordinator writes.

## Approvals and artifacts

An injected `ApprovalProvider` supplies local consent without coupling the
service to a terminal or UI. The service persists the approval request before
asking the provider and persists the resolution before resuming the runtime.

The current validator is deliberately specific to source-verification output.
It validates with the protocol schema and computes SHA-256 over canonical JSON.
An injected `LocalArtifactStore` persists validated output before remote
submission. Missing, mismatched, or invalid artifacts are final workflow
failures.

## Failure disposition and recovery

Run failures carry `{ retryable, code, message }` plus their domain reason.
Memory and Convex coordinators preserve the same disposition: retryable work is
eligible for reassignment when attempts remain, while final failure is
terminal.

Before cleanup the service reads authoritative state. If completion succeeded
but its response was lost, the result is recovered as completed. Otherwise it
releases a lease acquired before run start, releases an active run after caller
cancellation, or records a classified run failure. Terminal state is never
mutated twice. Cleanup failures attach to the primary error rather than hiding
its cause. When validated output was persisted before a later failure, the
failed result retains its artifact ID, content hash, local output reference,
and whether remote submission was confirmed.

## Deferred work

- persistent execution handles and crash recovery;
- validated IPC transport and event replay for Electron;
- runner-managed lease renewal and capacity/concurrency policy;
- checkpoint and durable artifact storage;
- workflow-generic artifact families and real runtime discovery;
- process supervision and daemon versus utility-process packaging.
