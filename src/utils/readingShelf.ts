import { canonicalizeChecklistKey } from './readingChecklist';

const STORAGE_KEY = 'propaedia-reading-shelf-v1';
const CHANGE_EVENT = 'propaedia:reading-shelf-change';

function normalizeShelfState(state: Record<string, boolean>): {
  state: Record<string, boolean>;
  changed: boolean;
} {
  let changed = false;
  const nextState: Record<string, boolean> = {};

  for (const [key, shelved] of Object.entries(state)) {
    if (!shelved) {
      changed = true;
      continue;
    }

    const canonicalKey = canonicalizeChecklistKey(key);
    if (canonicalKey !== key) {
      changed = true;
    }

    nextState[canonicalKey] = true;
  }

  return { state: nextState, changed };
}

export function readShelfState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const normalized = normalizeShelfState(parsed);
    if (normalized.changed) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.state));
    }

    return normalized.state;
  } catch {
    return {};
  }
}

export function writeShelfState(key: string, shelved: boolean): void {
  if (typeof window === 'undefined') return;

  const nextState = { ...readShelfState() };
  const canonicalKey = canonicalizeChecklistKey(key);

  if (shelved) {
    nextState[canonicalKey] = true;
  } else {
    for (const existingKey of Object.keys(nextState)) {
      if (canonicalizeChecklistKey(existingKey) === canonicalKey) {
        delete nextState[existingKey];
      }
    }
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key: canonicalKey, shelved } }));
  } catch {
    // Ignore storage failures and keep the UI responsive.
  }
}

export function subscribeShelfState(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };

  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
}
