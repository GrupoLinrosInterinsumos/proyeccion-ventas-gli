// Client-side registry of in-flight saves and of every editable row's "save my pending edits"
// callback. Fields still save themselves on blur; this is what lets the general "Guardar todo"
// button flush anything pending (including a save that failed earlier) and know when it's done.

export type SaveState = { pending: number; error: boolean; lastSavedAt: number | null };

let state: SaveState = { pending: 0, error: false, lastSavedAt: null };
const listeners = new Set<() => void>();
const idleWaiters: Array<() => void> = [];
const flushers = new Set<() => void>();

function setState(next: Partial<SaveState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (state.pending === 0) idleWaiters.splice(0).forEach((resolve) => resolve());
}

export function subscribeSaves(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSaveState(): SaveState {
  return state;
}

/** Wraps a save request so the general button reflects it. Resolves with the action's own result. */
export async function trackSave<T extends { error?: string } | null | void | undefined>(
  request: Promise<T>
): Promise<T> {
  setState({ pending: state.pending + 1 });
  try {
    const res = await request;
    const failed = !!(res && (res as { error?: string }).error);
    setState({
      pending: state.pending - 1,
      error: failed,
      lastSavedAt: failed ? state.lastSavedAt : Date.now(),
    });
    return res;
  } catch (err) {
    setState({ pending: state.pending - 1, error: true });
    throw err;
  }
}

/** A row registers how to persist its own pending edits; returns the unregister function. */
export function registerFlush(fn: () => void): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export function flushAll(): void {
  flushers.forEach((fn) => fn());
}

export function whenSavesIdle(): Promise<void> {
  if (state.pending === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}
