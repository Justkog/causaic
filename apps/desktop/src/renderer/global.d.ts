import type { CausaicDesktopApi } from '../shared/contracts.js';

declare global {
  interface Window {
    readonly causaicDesktop: CausaicDesktopApi;
  }
}

export {};
