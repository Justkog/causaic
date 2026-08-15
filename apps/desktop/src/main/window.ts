import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BrowserWindow } from 'electron';

export function isAllowedRendererNavigation(
  target: string,
  rendererEntry: string,
): boolean {
  try {
    const targetUrl = new URL(target);
    const entryUrl = new URL(rendererEntry);
    return (
      targetUrl.protocol === entryUrl.protocol &&
      targetUrl.origin === entryUrl.origin &&
      targetUrl.pathname === entryUrl.pathname
    );
  } catch {
    return false;
  }
}

export function createMainWindow(): BrowserWindow {
  const rendererEntry =
    process.env.ELECTRON_RENDERER_URL ??
    pathToFileURL(
      join(import.meta.dirname, '../renderer/index.html'),
    ).toString();
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    if (!isAllowedRendererNavigation(target, rendererEntry))
      event.preventDefault();
  });

  void window.loadURL(rendererEntry);

  return window;
}
