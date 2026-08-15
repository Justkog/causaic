import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { ConvexJobCoordinator } from '@causaic/coordinator-convex';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import {
  app,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  session,
  shell,
  Tray,
} from 'electron';
import type { BrowserWindow } from 'electron';

import { ipcChannels } from '../shared/channels.js';
import type { FocusTarget } from '../shared/contracts.js';
import { DesktopError } from '../shared/errors.js';
import { cleanArtifactDirectory } from './persistence/artifact-store.js';
import { ElectronApprovalProvider } from './approval-provider.js';
import { BackendMonitor } from './backend-monitor.js';
import { loadDesktopConfig } from './config.js';
import { DesktopExecutionController } from './execution-controller.js';
import type { DesktopNotificationKind } from './execution-controller.js';
import { InProcessExecutionHost } from './execution-host.js';
import { registerDesktopIpc } from './ipc.js';
import {
  desktopDataPaths,
  openDesktopDatabase,
  type DesktopDatabaseHandle,
  type DesktopDataPaths,
} from './persistence/database.js';
import {
  hydrateCurrentExecution,
  hydrateRecentExecution,
} from './persistence/hydration.js';
import { DesktopRepositories } from './persistence/repositories.js';
import { DesktopRecoveryService } from './recovery/recovery-service.js';
import { LeaseRenewalService } from './recovery/lease-renewal.js';
import { createRedactor } from './redaction.js';
import { DesktopStateStore } from './state.js';
import { trayMenuTemplate } from './tray.js';
import { createMainWindow } from './window.js';

app.enableSandbox();
app.setName('Causaic');

const state = new DesktopStateStore();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | undefined;
let monitor: BackendMonitor | undefined;
let controller: DesktopExecutionController | undefined;
let database: DesktopDatabaseHandle | undefined;
let repositories: DesktopRepositories | undefined;
let dataPaths: DesktopDataPaths | undefined;
let quitting = false;

type StartupPhase = 'configuration' | 'local_storage' | 'coordinator';

function reportStartupFailure(phase: StartupPhase, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  const abiMatch = message.match(
    /NODE_MODULE_VERSION\s+(\d+)[\s\S]*NODE_MODULE_VERSION\s+(\d+)/,
  );
  if (abiMatch !== null) {
    console.error(
      `[DESKTOP_SQLITE_NATIVE_ABI_MISMATCH] better-sqlite3 targets ABI ${abiMatch[1]}; Electron requires ABI ${abiMatch[2]}. Re-run pnpm desktop:dev to prepare the isolated runtime dependencies.`,
    );
    return;
  }
  const codes: Record<StartupPhase, string> = {
    configuration: 'DESKTOP_CONFIGURATION_INVALID',
    local_storage: 'DESKTOP_LOCAL_STORAGE_UNAVAILABLE',
    coordinator: 'DESKTOP_COORDINATOR_STARTUP_FAILED',
  };
  console.error(`[${codes[phase]}] Desktop startup could not continue safely.`);
}

const trayIcon = nativeImage.createFromDataURL(
  'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#0284c7"/><path d="M16 8.5a5 5 0 1 0 0 7" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>',
    ),
);

function showWindow(target: FocusTarget = 'jobs'): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    attachWindowLifecycle(mainWindow);
  }
  mainWindow.show();
  mainWindow.focus();
  const sendTarget = () =>
    mainWindow?.webContents.send(ipcChannels.focusTarget, target);
  if (mainWindow.webContents.isLoading())
    mainWindow.webContents.once('did-finish-load', sendTarget);
  else sendTarget();
}

function attachWindowLifecycle(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
}

function notify(title: string, body: string, target: FocusTarget): void {
  if (mainWindow?.isFocused() === true || !Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  notification.on('click', () => showWindow(target));
  notification.show();
}

function notifyExecution(kind: DesktopNotificationKind): void {
  const messages: Record<DesktopNotificationKind, [string, string]> = {
    execution_started: [
      'Contribution started',
      'Causaic has started the selected job.',
    ],
    approval_required: [
      'Approval required',
      'A running contribution needs your decision.',
    ],
    completed: [
      'Contribution completed',
      'The artifact was submitted successfully.',
    ],
    failed: ['Contribution failed', 'Open Causaic to review the failure.'],
    cancelled: [
      'Contribution cancelled',
      'The active contribution was cancelled.',
    ],
  };
  const [title, body] = messages[kind];
  notify(title, body, 'execution');
}

async function confirmCancellation(message: string): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: ['Keep running', 'Cancel execution'],
    cancelId: 0,
    defaultId: 0,
    title: 'Cancel active contribution?',
    message,
  };
  const result =
    mainWindow === null
      ? await dialog.showMessageBox(options)
      : await dialog.showMessageBox(mainWindow, options);
  return result.response === 1;
}

async function requestCancel(): Promise<void> {
  if (controller?.hasActiveExecution() !== true) return;
  if (
    !(await confirmCancellation('The job will be returned for reassignment.'))
  )
    return;
  await controller.cancel('Cancelled from the desktop application');
}

async function requestQuit(): Promise<void> {
  if (quitting) return;
  if (controller?.hasActiveExecution() === true) {
    if (
      !(await confirmCancellation(
        'Causaic must cancel the active contribution and finish cleanup before quitting.',
      ))
    )
      return;
    await controller.cancel('Cancelled while quitting Causaic');
  }
  quitting = true;
  monitor?.stop();
  database?.close();
  database = undefined;
  app.quit();
}

async function requestResetLocalState(): Promise<void> {
  if (
    database === undefined ||
    repositories === undefined ||
    dataPaths === undefined
  )
    throw new DesktopError(
      'configuration_invalid',
      'Local persistence is not available.',
    );
  if (
    controller?.hasActiveExecution() === true ||
    repositories.hasUnsafeResetState()
  )
    throw new DesktopError(
      'execution_active',
      'Resolve or clean up local work before resetting desktop data.',
    );
  monitor?.stop();
  database.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  database.close();
  database = undefined;
  const resetBackup = join(dataPaths.backups, `reset-${Date.now()}`);
  await mkdir(resetBackup, { recursive: true, mode: 0o700 });
  await rename(dataPaths.database, join(resetBackup, 'causaic.sqlite'));
  await rename(dataPaths.artifacts, join(resetBackup, 'artifacts'));
  app.relaunch();
  app.exit(0);
}

function updateTray(): void {
  if (tray === undefined) return;
  tray.setContextMenu(
    Menu.buildFromTemplate(
      trayMenuTemplate(state.get(), {
        open: () => showWindow('jobs'),
        setPaused: (paused) => {
          repositories?.setPaused(paused);
          state.update((current) => ({ ...current, paused }));
        },
        cancel: () => void requestCancel(),
        quit: () => void requestQuit(),
      }),
    ),
  );
}

async function bootstrap(): Promise<void> {
  const developmentRenderer = process.env.ELECTRON_RENDERER_URL !== undefined;
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self'${developmentRenderer ? " 'unsafe-inline'" : ''}`,
    `style-src 'self'${developmentRenderer ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    `connect-src 'self'${
      developmentRenderer ? ' http://localhost:* ws://localhost:*' : ''
    }`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    });
  });
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  mainWindow = createMainWindow();
  attachWindowLifecycle(mainWindow);

  tray = new Tray(trayIcon);
  tray.setToolTip('Causaic');
  tray.on('click', () => showWindow('jobs'));

  state.subscribe((next) => {
    if (mainWindow !== null && !mainWindow.isDestroyed())
      mainWindow.webContents.send(ipcChannels.stateChanged, next);
    updateTray();
  });
  updateTray();

  let startupPhase: StartupPhase = 'configuration';
  try {
    const config = loadDesktopConfig(process.env);
    startupPhase = 'local_storage';
    const paths = desktopDataPaths(app.getPath('userData'));
    dataPaths = paths;
    database = await openDesktopDatabase({
      paths,
      migrationsFolder: app.isPackaged
        ? join(process.resourcesPath, 'migrations')
        : join(app.getAppPath(), 'drizzle'),
    });
    repositories = new DesktopRepositories(database);
    repositories.initialize(config.nodeExternalId);
    repositories.prune();
    await cleanArtifactDirectory(
      paths.artifacts,
      repositories.artifactRelativePaths(),
    );
    const preferences = repositories.preferences();
    state.update((current) => ({
      ...current,
      paused: preferences.paused,
      lastSelectedView: preferences.lastSelectedView,
      currentExecution: hydrateCurrentExecution(repositories!),
      recentExecution: hydrateRecentExecution(repositories!),
    }));
    startupPhase = 'coordinator';
    const coordinator = new ConvexJobCoordinator({
      convexUrl: config.convexUrl,
      nodeExternalId: config.nodeExternalId,
      developmentSecret: config.developmentSecret,
      defaultLeaseDurationMs: config.defaultLeaseDurationMs,
    });
    const redactor = createRedactor([config.developmentSecret]);
    const controllerReference: { current?: DesktopExecutionController } = {};
    const recoveryReference: { current?: DesktopRecoveryService } = {};
    let recoveryPending = true;
    const approvalProvider = new ElectronApprovalProvider((request) =>
      controllerReference.current?.setPendingApproval(request),
    );
    const leaseRenewal = new LeaseRenewalService({
      coordinator,
      repositories,
      nodeId: config.nodeExternalId,
      durationMs: config.defaultLeaseDurationMs,
    });
    monitor = new BackendMonitor({
      coordinator,
      state,
      onNewJobs: (count) =>
        notify(
          'New work available',
          `${count} new contribution${count === 1 ? ' is' : 's are'} ready.`,
          'jobs',
        ),
      onConnected: async () => {
        const recovery = recoveryReference.current;
        if (!recoveryPending || recovery === undefined) return;
        recoveryPending = false;
        try {
          await recovery.recoverOnStartup();
          state.update((current) => ({
            ...current,
            currentExecution: hydrateCurrentExecution(repositories!),
            recentExecution: hydrateRecentExecution(repositories!),
          }));
        } catch {
          recoveryPending = true;
        }
      },
    });
    const host = new InProcessExecutionHost({
      coordinator,
      runtime: new FakeRuntimeAdapter(),
      approvalProvider,
      repositories,
      artifactRoot: paths.artifacts,
      nodeId: config.nodeExternalId,
      executorId: config.executorId,
      contributorId: config.contributorId,
      leaseDurationMs: config.defaultLeaseDurationMs,
    });
    controller = new DesktopExecutionController({
      state,
      monitor,
      host,
      approvalProvider,
      redact: redactor,
      notify: notifyExecution,
      leaseRenewal,
      cancelRecovered: async () => {
        await recoveryReference.current?.endInterruptedExecution();
        state.update((current) => ({
          ...current,
          currentExecution: hydrateCurrentExecution(repositories!),
          recentExecution: hydrateRecentExecution(repositories!),
          recovery: { status: 'recovered', recoveredExecutions: 1 },
        }));
        await monitor?.refresh();
      },
      persistence: {
        repositories,
        nodeId: config.nodeExternalId,
        executorId: config.executorId,
        runtimeType: 'fake',
      },
    });
    controllerReference.current = controller;
    const recovery = new DesktopRecoveryService({
      coordinator,
      repositories,
      state,
      nodeId: config.nodeExternalId,
      executorId: config.executorId,
      artifactRoot: paths.artifacts,
    });
    recoveryReference.current = recovery;
    try {
      await recovery.recoverOnStartup();
      recoveryPending = false;
      state.update((current) => ({
        ...current,
        currentExecution: hydrateCurrentExecution(repositories!),
        recentExecution: hydrateRecentExecution(repositories!),
      }));
      const interrupted = repositories.incompleteExecutions()[0];
      if (interrupted !== undefined && interrupted.leaseId !== null) {
        await leaseRenewal.start(interrupted.id, interrupted.leaseId, () => {
          repositories?.updateExecution(interrupted.id, {
            recoveryStatus: 'attention_required',
          });
          state.update((current) => ({
            ...current,
            recovery: {
              status: 'attention_required',
              issues: ['The recovered lease is no longer owned by this node.'],
            },
          }));
        });
      }
    } catch {
      state.update((current) => ({
        ...current,
        recovery: {
          status: 'failed',
          safeMessage:
            'Recovery is waiting for the local coordinator. New work remains disabled.',
        },
      }));
    }
    monitor.start();
  } catch (error) {
    reportStartupFailure(startupPhase, error);
    const connection =
      startupPhase === 'configuration'
        ? {
            status: 'failed_configuration' as const,
            stale: false,
            message:
              'Enable desktop development and configure a loopback Convex deployment.',
          }
        : startupPhase === 'local_storage'
          ? {
              status: 'failed_local_storage' as const,
              stale: false,
              message:
                'Local desktop storage could not be loaded or migrated safely.',
            }
          : {
              status: 'temporarily_unavailable' as const,
              stale: false,
              message: 'The local coordinator could not be initialized.',
            };
    state.update((current) => ({
      ...current,
      connection,
      ...(startupPhase === 'local_storage'
        ? {
            recovery: {
              status: 'failed' as const,
              safeMessage:
                'Local state could not be migrated or validated. Restore the backup before retrying.',
            },
          }
        : {}),
    }));
  }

  registerDesktopIpc({
    ipcMain,
    getWindow: () => mainWindow,
    state,
    ...(monitor === undefined ? {} : { monitor }),
    ...(controller === undefined ? {} : { controller }),
    setPaused: (paused) => repositories?.setPaused(paused),
    setSelectedView: (view) => repositories?.setLastSelectedView(view),
    openExternal: (url) => shell.openExternal(url),
    requestQuit,
    requestResetLocalState,
  });
  powerMonitor.on('resume', () => void monitor?.refresh());
}

app.on('before-quit', (event) => {
  if (quitting) return;
  if (controller?.hasActiveExecution() === true) {
    event.preventDefault();
    void requestQuit();
    return;
  }
  quitting = true;
});
app.on('activate', () => showWindow('jobs'));
app.on('window-all-closed', () => undefined);

void app.whenReady().then(bootstrap);
