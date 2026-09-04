import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { initialDesktopState } from '../shared/contracts.js';
import type {
  DesktopState,
  FocusTarget,
  ResolveApprovalRequest,
} from '../shared/contracts.js';

interface DesktopContextValue {
  readonly state: DesktopState;
  readonly loading: boolean;
  readonly error?: string;
  readonly focusTarget?: FocusTarget;
  readonly refresh: () => Promise<void>;
  readonly start: (
    opportunityId: DesktopState['availableOpportunities'][number]['id'],
  ) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly resolveApproval: (request: ResolveApprovalRequest) => Promise<void>;
  readonly setPaused: (paused: boolean) => Promise<void>;
  readonly setSelectedView: (view: FocusTarget) => Promise<void>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly quit: () => Promise<void>;
  readonly resetLocalState: () => Promise<void>;
  readonly clearFocusTarget: () => void;
}

const DesktopContext = createContext<DesktopContextValue | undefined>(
  undefined,
);

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        '',
      )
    : 'The desktop request failed.';
}

export function DesktopStateProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [state, setState] = useState(initialDesktopState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [focusTarget, setFocusTarget] = useState<FocusTarget>();

  const apply = useCallback((next: DesktopState) => {
    setState((current) => (next.revision >= current.revision ? next : current));
  }, []);

  useEffect(() => {
    const unsubscribeState = window.causaicDesktop.onStateChanged(apply);
    const unsubscribeFocus =
      window.causaicDesktop.onFocusTarget(setFocusTarget);
    void window.causaicDesktop
      .getState()
      .then(apply)
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
    return () => {
      unsubscribeState();
      unsubscribeFocus();
    };
  }, [apply]);

  const run = useCallback(
    async (operation: () => Promise<DesktopState>) => {
      setError(undefined);
      try {
        apply(await operation());
      } catch (caught) {
        setError(messageFor(caught));
      }
    },
    [apply],
  );

  const value = useMemo<DesktopContextValue>(
    () => ({
      state,
      loading,
      ...(error === undefined ? {} : { error }),
      ...(focusTarget === undefined ? {} : { focusTarget }),
      refresh: () => run(() => window.causaicDesktop.refreshOpportunities()),
      start: (opportunityId) =>
        run(() => window.causaicDesktop.startExecution({ opportunityId })),
      cancel: () =>
        run(() =>
          window.causaicDesktop.cancelExecution({
            reason: 'Cancelled by the contributor',
          }),
        ),
      resolveApproval: (request) =>
        run(() => window.causaicDesktop.resolveApproval(request)),
      setPaused: (paused) =>
        run(() => window.causaicDesktop.setPaused({ paused })),
      setSelectedView: (view) =>
        run(() => window.causaicDesktop.setSelectedView({ view })),
      openExternal: (url) => window.causaicDesktop.openExternal({ url }),
      quit: () => window.causaicDesktop.quit(),
      resetLocalState: () =>
        window.causaicDesktop.resetLocalState({
          confirmation: 'RESET LOCAL DATA',
        }),
      clearFocusTarget: () => setFocusTarget(undefined),
    }),
    [error, focusTarget, loading, run, state],
  );

  return (
    <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>
  );
}

export function useDesktopState(): DesktopContextValue {
  const context = useContext(DesktopContext);
  if (context === undefined)
    throw new Error('useDesktopState must be used inside DesktopStateProvider');
  return context;
}
