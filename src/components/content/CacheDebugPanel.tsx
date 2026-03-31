import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const CACHE_DEBUG_STORAGE_KEY = 'propaedia-cache-debug';

function readCacheDebugPreference(): boolean | null {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(CACHE_DEBUG_STORAGE_KEY) === '1';
  } catch (_error) {
    return null;
  }
}

function writeCacheDebugPreference(enabled: boolean): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (enabled) {
      window.localStorage.setItem(CACHE_DEBUG_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(CACHE_DEBUG_STORAGE_KEY);
    }
    return true;
  } catch (_error) {
    return false;
  }
}

export default function CacheDebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    const nextEnabled = readCacheDebugPreference();
    if (nextEnabled === null) {
      setStorageAvailable(false);
      return;
    }

    setEnabled(nextEnabled);
  }, []);

  function handleToggle() {
    const nextEnabled = !enabled;
    const didPersist = writeCacheDebugPreference(nextEnabled);
    if (!didPersist) {
      setStorageAvailable(false);
      return;
    }

    setEnabled(nextEnabled);
    window.location.reload();
  }

  return (
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-3xl space-y-2">
          <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Cache Debug
          </p>
          <h2 class="font-serif text-2xl text-slate-900">Show cache source details in the app</h2>
          <p class="text-sm leading-6 text-slate-600">
            This adds a small fixed badge that shows whether the current page, JSON data, and app assets came from
            the full offline snapshot, the core cache, or the network.
          </p>
          <p class="text-sm leading-6 text-slate-600">
            The setting persists across pages on this device. Turning it on or off reloads the current page once so the
            badge state is applied immediately.
          </p>
          {!storageAvailable ? (
            <p class="text-sm leading-6 text-red-700">
              This browser is blocking local storage, so the cache debug setting cannot be saved here.
            </p>
          ) : null}
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p>
            Status: <span class="font-medium text-slate-900">{enabled ? 'On' : 'Off'}</span>
          </p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleToggle}
          class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {enabled ? 'Hide cache debug badge' : 'Show cache debug badge'}
        </button>
      </div>
    </section>
  );
}
