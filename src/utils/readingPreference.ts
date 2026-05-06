/**
 * Site-wide default reading type shared across recommendation views.
 */

export type ReadingType = 'vsi' | 'wikipedia' | 'iot' | 'macropaedia';
export type ReadingPoolScope = 'all' | 'shelved';
export type ReadingLibraryScope = 'library' | 'shelf';
export type ReadingLibraryCheckedFilter = 'both' | 'checked' | 'unchecked';
export interface ReadingLibraryControlsPreference<TSortField extends string = string> {
  scope: ReadingLibraryScope;
  checkedFilter: ReadingLibraryCheckedFilter;
  sortField: TSortField;
  sortDirection: 'asc' | 'desc';
}

const STORAGE_KEY = 'propaedia-reading-preference';
const CHANGE_EVENT = 'propaedia:reading-preference-change';

export const READING_TYPE_ORDER: ReadingType[] = ['vsi', 'iot', 'wikipedia', 'macropaedia'];

export const READING_TYPE_LABELS: Record<ReadingType, string> = {
  vsi: 'Oxford VSI',
  wikipedia: 'Wikipedia',
  iot: 'BBC In Our Time',
  macropaedia: 'Britannica',
};

export const READING_TYPE_UI_META: Record<ReadingType, {
  eyebrow: string;
  label: string;
  accentColor: string;
}> = {
  vsi: {
    eyebrow: 'Books',
    label: 'Oxford VSI',
    accentColor: '#4f46e5',
  },
  iot: {
    eyebrow: 'Audio',
    label: 'In Our Time',
    accentColor: '#ea580c',
  },
  wikipedia: {
    eyebrow: 'Reference',
    label: 'Wikipedia',
    accentColor: '#0f172a',
  },
  macropaedia: {
    eyebrow: 'Britannica',
    label: 'Britannica',
    accentColor: '#0f766e',
  },
};

export function getReadingPreference(): ReadingType {
  if (typeof window === 'undefined') return 'vsi';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'vsi' || stored === 'wikipedia' || stored === 'iot' || stored === 'macropaedia') {
      return stored;
    }
  } catch {
    // Ignore
  }
  return 'vsi';
}

export function setReadingPreference(type: ReadingType): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, type);
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: type }));
}

// --- Hide checked readings on outline pages ---

const HIDE_CHECKED_KEY = 'propaedia-hide-checked-readings';
const HIDE_CHECKED_EVENT = 'propaedia:hide-checked-change';

export function getHideCheckedReadings(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(HIDE_CHECKED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setHideCheckedReadings(hide: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HIDE_CHECKED_KEY, String(hide));
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent(HIDE_CHECKED_EVENT, { detail: hide }));
}

export function subscribeHideCheckedReadings(callback: (hide: boolean) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<boolean>).detail);
  };
  document.addEventListener(HIDE_CHECKED_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === HIDE_CHECKED_KEY) {
      callback(event.newValue === 'true');
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(HIDE_CHECKED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// --- Coverage layer preference ---

import type { CoverageLayer } from './readingLibrary';

const LEGACY_LAYER_KEY = 'propaedia-coverage-layer';
const LAYER_KEY_PREFIX = 'propaedia-coverage-layer';
const LAYER_EVENT = 'propaedia:coverage-layer-change';
const VALID_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
type CoverageLayerPreferenceDetail = {
  readingType: ReadingType;
  layer: CoverageLayer;
};

function coverageLayerKey(readingType: ReadingType): string {
  return `${LAYER_KEY_PREFIX}:${readingType}`;
}

export function getCoverageLayerPreference(readingType: ReadingType = getReadingPreference()): CoverageLayer {
  if (typeof window === 'undefined') return 'part';
  try {
    const stored = localStorage.getItem(coverageLayerKey(readingType));
    if (stored && VALID_LAYERS.includes(stored as CoverageLayer)) {
      return stored as CoverageLayer;
    }

    const legacyStored = localStorage.getItem(LEGACY_LAYER_KEY);
    if (legacyStored && VALID_LAYERS.includes(legacyStored as CoverageLayer)) {
      return legacyStored as CoverageLayer;
    }
  } catch {
    // Ignore
  }
  return 'part';
}

export function setCoverageLayerPreference(readingType: ReadingType, layer: CoverageLayer): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(coverageLayerKey(readingType), layer);
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent<CoverageLayerPreferenceDetail>(LAYER_EVENT, {
    detail: { readingType, layer },
  }));
}

export function subscribeCoverageLayerPreference(readingType: ReadingType, callback: (layer: CoverageLayer) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CoverageLayerPreferenceDetail>).detail;
    if (!detail || detail.readingType !== readingType) return;
    callback(detail.layer);
  };
  document.addEventListener(LAYER_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === coverageLayerKey(readingType) && event.newValue && VALID_LAYERS.includes(event.newValue as CoverageLayer)) {
      callback(event.newValue as CoverageLayer);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(LAYER_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function subscribeReadingPreference(callback: (type: ReadingType) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<ReadingType>).detail);
  };
  document.addEventListener(CHANGE_EVENT, handler);

  // Also listen for cross-tab changes
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      callback(event.newValue as ReadingType);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// --- Reading pool scope preference ---

const LEGACY_READING_POOL_SCOPE_KEY = 'propaedia-reading-pool-scope';
const READING_POOL_SCOPE_KEY_PREFIX = 'propaedia-reading-pool-scope';
const READING_POOL_SCOPE_EVENT = 'propaedia:reading-pool-scope-change';
type ReadingPoolScopePreferenceDetail = {
  readingType: ReadingType;
  scope: ReadingPoolScope;
};

function readingPoolScopeKey(readingType: ReadingType): string {
  return `${READING_POOL_SCOPE_KEY_PREFIX}:${readingType}`;
}

export function getReadingPoolScopePreference(readingType: ReadingType = getReadingPreference()): ReadingPoolScope {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = localStorage.getItem(readingPoolScopeKey(readingType));
    if (stored === 'all' || stored === 'shelved') {
      return stored;
    }

    const libraryScope = coerceReadingLibraryScope(localStorage.getItem(readingLibraryScopeKey(readingType)));
    if (libraryScope) {
      return readingPoolScopeFromLibraryScope(libraryScope);
    }

    const legacyStored = localStorage.getItem(LEGACY_READING_POOL_SCOPE_KEY);
    if (legacyStored === 'all' || legacyStored === 'shelved') {
      return legacyStored;
    }

    const legacyLibraryScope = coerceReadingLibraryScope(localStorage.getItem(LEGACY_READING_LIBRARY_SCOPE_KEY));
    if (legacyLibraryScope) {
      return readingPoolScopeFromLibraryScope(legacyLibraryScope);
    }
  } catch {
    // Ignore
  }
  return 'all';
}

export function setReadingPoolScopePreference(readingType: ReadingType, scope: ReadingPoolScope): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(readingPoolScopeKey(readingType), scope);
    localStorage.setItem(readingLibraryScopeKey(readingType), readingLibraryScopeFromPoolScope(scope));
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent<ReadingPoolScopePreferenceDetail>(READING_POOL_SCOPE_EVENT, {
    detail: { readingType, scope },
  }));
}

export function subscribeReadingPoolScopePreference(readingType: ReadingType, callback: (scope: ReadingPoolScope) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ReadingPoolScopePreferenceDetail>).detail;
    if (!detail || detail.readingType !== readingType) return;
    callback(detail.scope);
  };
  document.addEventListener(READING_POOL_SCOPE_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === readingPoolScopeKey(readingType) && (event.newValue === 'all' || event.newValue === 'shelved')) {
      callback(event.newValue);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(READING_POOL_SCOPE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// --- Reading library controls preference ---

const READING_LIBRARY_CONTROLS_KEY_PREFIX = 'propaedia-reading-library-controls';
const LEGACY_READING_LIBRARY_SCOPE_KEY = 'propaedia-reading-library-scope';
const READING_LIBRARY_SCOPE_KEY_PREFIX = 'propaedia-reading-library-scope';

function readingLibraryControlsKey(readingType: ReadingType): string {
  return `${READING_LIBRARY_CONTROLS_KEY_PREFIX}:${readingType}`;
}

function readingLibraryScopeKey(readingType: ReadingType): string {
  return `${READING_LIBRARY_SCOPE_KEY_PREFIX}:${readingType}`;
}

function coerceReadingLibraryScope(value: unknown): ReadingLibraryScope | null {
  return value === 'shelf' || value === 'library' ? value : null;
}

function coerceLegacyReadingLibraryScope(value: unknown): ReadingLibraryScope | null {
  if (value === true) return 'shelf';
  if (value === false) return 'library';
  return null;
}

function readingPoolScopeFromLibraryScope(scope: ReadingLibraryScope): ReadingPoolScope {
  return scope === 'shelf' ? 'shelved' : 'all';
}

function readingLibraryScopeFromPoolScope(scope: ReadingPoolScope): ReadingLibraryScope {
  return scope === 'shelved' ? 'shelf' : 'library';
}

export function getReadingLibraryScopePreference(readingType?: ReadingType): ReadingLibraryScope {
  if (typeof window === 'undefined') return 'library';

  const resolvedReadingType = readingType ?? getReadingPreference();

  try {
    const scoped = coerceReadingLibraryScope(localStorage.getItem(readingLibraryScopeKey(resolvedReadingType)));
    if (scoped) return scoped;

    const poolScope = localStorage.getItem(readingPoolScopeKey(resolvedReadingType));
    if (poolScope === 'all' || poolScope === 'shelved') {
      return readingLibraryScopeFromPoolScope(poolScope);
    }

    const legacyScope = coerceReadingLibraryScope(localStorage.getItem(LEGACY_READING_LIBRARY_SCOPE_KEY));
    if (legacyScope) return legacyScope;

    const legacyPoolScope = localStorage.getItem(LEGACY_READING_POOL_SCOPE_KEY);
    if (legacyPoolScope === 'all' || legacyPoolScope === 'shelved') {
      return readingLibraryScopeFromPoolScope(legacyPoolScope);
    }

    {
      const raw = localStorage.getItem(readingLibraryControlsKey(resolvedReadingType));
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const legacyScoped = coerceReadingLibraryScope(parsed.scope) ?? coerceLegacyReadingLibraryScope(parsed.shelvedOnly);
        if (legacyScoped) return legacyScoped;
      }
    }
  } catch {
    // Ignore
  }

  return 'library';
}

export function getReadingLibraryControlsPreference<TSortField extends string>(
  readingType: ReadingType,
  defaultSortField: TSortField,
  defaultSortDirection: 'asc' | 'desc' = 'desc'
): ReadingLibraryControlsPreference<TSortField> {
  const fallback: ReadingLibraryControlsPreference<TSortField> = {
    scope: getReadingLibraryScopePreference(readingType),
    checkedFilter: 'both',
    sortField: defaultSortField,
    sortDirection: defaultSortDirection,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(readingLibraryControlsKey(readingType));
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<ReadingLibraryControlsPreference<string>> & {
      shelvedOnly?: boolean;
      checkedOnly?: boolean;
    };

    const scope = getReadingLibraryScopePreference(readingType);
    const checkedFilter = parsed.checkedFilter === 'checked' || parsed.checkedFilter === 'unchecked' || parsed.checkedFilter === 'both'
      ? parsed.checkedFilter
      : parsed.checkedOnly === true
        ? 'checked'
        : 'both';

    return {
      scope,
      checkedFilter,
      sortField: (typeof parsed.sortField === 'string' ? parsed.sortField : defaultSortField) as TSortField,
      sortDirection: parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc'
        ? parsed.sortDirection
        : defaultSortDirection,
    };
  } catch {
    return fallback;
  }
}

export function setReadingLibraryControlsPreference(
  readingType: ReadingType,
  preference: ReadingLibraryControlsPreference
): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(readingLibraryScopeKey(readingType), preference.scope);
    localStorage.setItem(readingPoolScopeKey(readingType), readingPoolScopeFromLibraryScope(preference.scope));
    localStorage.setItem(readingLibraryControlsKey(readingType), JSON.stringify(preference));
  } catch {
    // Ignore
  }

  document.dispatchEvent(new CustomEvent<ReadingPoolScopePreferenceDetail>(READING_POOL_SCOPE_EVENT, {
    detail: { readingType, scope: readingPoolScopeFromLibraryScope(preference.scope) },
  }));
}

export function setReadingLibraryScopePreference(
  readingType: ReadingType,
  scope: ReadingLibraryScope,
): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(readingLibraryScopeKey(readingType), scope);
    localStorage.setItem(readingPoolScopeKey(readingType), readingPoolScopeFromLibraryScope(scope));
  } catch {
    // Ignore
  }

  document.dispatchEvent(
    new CustomEvent<ReadingPoolScopePreferenceDetail>(READING_POOL_SCOPE_EVENT, {
      detail: {
        readingType,
        scope: readingPoolScopeFromLibraryScope(scope),
      },
    }),
  );
}

export function setReadingLibraryCheckedFilterPreference(
  readingType: ReadingType,
  checkedFilter: ReadingLibraryCheckedFilter,
): void {
  if (typeof window === 'undefined') return;

  try {
    const key = readingLibraryControlsKey(readingType);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};

    localStorage.setItem(
      key,
      JSON.stringify({
        ...parsed,
        checkedFilter,
      }),
    );
  } catch {
    // Ignore
  }
}
