import {
  DesktopStateSchema,
  initialDesktopState,
} from '../shared/contracts.js';
import type { DesktopState } from '../shared/contracts.js';

export type DesktopStateListener = (state: DesktopState) => void;

export class DesktopStateStore {
  #state: DesktopState = initialDesktopState();
  readonly #listeners = new Set<DesktopStateListener>();

  public get(): DesktopState {
    return this.#state;
  }

  public replace(next: Omit<DesktopState, 'revision'>): DesktopState {
    this.#state = DesktopStateSchema.parse({
      ...next,
      revision: this.#state.revision + 1,
    });
    for (const listener of this.#listeners) listener(this.#state);
    return this.#state;
  }

  public update(
    change: (state: DesktopState) => Omit<DesktopState, 'revision'>,
  ): DesktopState {
    return this.replace(change(this.#state));
  }

  public subscribe(listener: DesktopStateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
