# Causaic desktop development milestone

This application is the Causaic Node development vertical slice. Electron main owns
the Convex coordinator, fake runtime, runner-core execution handle, approvals,
tray, and notifications. The sandboxed React renderer receives only validated
portable snapshots through preload.

## Local setup

Configure the local development deployment from the sibling private
`causaic-cloud` repository and its development secret:

```bash
export CAUSAIC_ENABLE_DESKTOP_DEVELOPMENT=true
export CONVEX_URL=http://127.0.0.1:3210
export CAUSAIC_NODE_ID=node_desktop-development
export CAUSAIC_DEV_NODE_SECRET=your-development-secret
export CAUSAIC_DEFAULT_LEASE_DURATION_MS=300000

pnpm desktop:dev
```

Only loopback Convex URLs are accepted by this development milestone. Invalid
configuration opens the app in a visible disabled state rather than exposing
environment values.

`desktop:dev` asks electron-builder to install and rebuild the isolated
`app/node_modules` dependencies, then verifies that Electron can open SQLite.
The repository-level `node_modules` remains compatible with regular Node and
Vitest; no restore command is required after desktop development.

## Manual smoke workflow

1. Seed the fixture and open the Opportunities view.
2. Review the source-verification opportunity and confirm the initial start.
3. Observe lease, run, phase, and progress updates in Execution.
4. Hide the window and restore it from the tray.
5. Approve the network request and observe artifact submission/completion.
6. Seed again, start another run, and cancel it from the renderer or tray.
7. Reload the renderer while approval is pending; the approval must rehydrate.
8. Stop and restart Convex; last-known opportunities must be marked stale and then
   replaced after reconnection.
9. Quit during an active run; confirm cancellation and wait for cleanup.
10. Optionally inspect the same deployment through its operator dashboard and
    confirm its authoritative state changes without refreshing.

## Packaging

`pnpm desktop:package` builds all three Electron entry points and runs
`electron-builder --dir`. The result is under `apps/desktop/dist/desktop`.
This milestone does not produce an installer and has no signing, publishing,
auto-update, or multi-platform CI configuration.

The unpacked Linux application requires the normal Electron desktop shared
libraries supplied by the host distribution, including `libasound.so.2`.

Electron-builder installs and rebuilds the production `better-sqlite3` copy
inside `apps/desktop/app/node_modules` before staging the package. The outer
workspace copy is a development dependency and is never rebuilt for Electron,
so packaging interruption cannot change the ABI used by Node tests.

WSL/Linux and Windows must not share either dependency tree: use a separate
Windows checkout on NTFS, run `pnpm install` there, then start with:

```powershell
.\scripts\desktop-dev-windows.ps1
```

Windows packaging must also run from that Windows checkout.

The nested runtime has its own lockfile and is installed with
`--ignore-workspace`; this prevents pnpm from linking its native module into the
workspace virtual store. A separate Windows checkout avoids cross-platform ABI
and platform churn.

Connection status distinguishes invalid configuration, unavailable local
storage, and temporary Convex unavailability. Recovery failures are reported
through recovery state and do not make a successful Convex query appear
disconnected.

## Durable local state and recovery

Electron stores local state under its platform-specific `userData` directory:

```text
causaic.sqlite
artifacts/
backups/
```

SQLite owns only preferences, bounded safe events, artifact files and metadata,
operation intent, and recovery diagnostics. Convex remains authoritative for
the shared job lifecycle. Startup backs up an existing older database, applies
committed forward migrations, then reconciles incomplete same-node work before
allowing another start.

An interrupted runtime is never resumed. Recovery may finish a verified local
artifact or idempotent cleanup while the lease remains active and owned. A
restored pending approval is cleanup-only because the original runtime no
longer exists. Foreign, expired, or conflicting ownership becomes an attention
state and is never mutated automatically.

For a development reset, first ensure no unresolved execution or unconfirmed
artifact remains, quit Causaic, back up the entire `userData` directory, and
remove the database and artifacts together. This does not reset Convex.

## Security and lifecycle boundaries

- The renderer has context isolation, no Node integration, and sandboxing.
- IPC channels and payloads are explicit and validated with Zod.
- Navigation, popup windows, and permission requests are denied.
- External HTTPS links must already occur in the current portable state.
- Credentials, Convex document IDs, raw runtime events, filesystem paths, and
  error causes do not enter renderer state.
- Closing the window hides it. Renderer reload does not stop main-owned work.
- Explicit quit cancels through runner-core and waits for authoritative cleanup.

## Known limitations

- Development credentials are environment variables rather than keychain data.
- The fake runtime runs inside Electron main and only one execution is allowed.
- Opportunity discovery polls every five seconds; there is no desktop offline queue.
- Runtime processes cannot continue across main-process restart; recovery can
  only reconcile and safely finish already-persisted output.
- There is no database encryption, authentication, real runtime, installer, or
  automated Electron end-to-end harness yet.
