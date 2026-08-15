# ADR 0003: Electron desktop toolchain

**Status:** Accepted

## Context

Causaic Node needs separate Electron main, preload, and renderer bundles, plus a
repeatable way to package a runnable local development application. The first
desktop milestone is intentionally local-only and does not require installers,
signing, publishing, or auto-update.

## Decision

Use Electron with React and Vite. Use `electron-vite` to build the main,
preload, and renderer entry points, and `electron-builder` to produce the
current platform's unpacked application directory.

Runner-core executes in the Electron main process for this milestone. This is
a reversible implementation boundary: desktop orchestration depends on a
small execution-host interface so a future utility process can replace the
in-process host without changing renderer IPC.

The renderer is sandboxed and communicates through a narrow, validated preload
API. Coordinator credentials and local execution details remain in main.

## Consequences

- Desktop development and packaging have one TypeScript-oriented toolchain.
- Main and preload dependencies are bundled, avoiding packaged pnpm workspace
  symlink assumptions.
- A runtime crash can currently affect Electron main; process isolation is a
  later milestone.
- Installers, signing, publishing, and multi-platform CI remain deferred.
