import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

interface OfflineManifestEntry {
  url: string;
  bytes: number;
}

interface OfflineManifest {
  version: string;
  generatedAt: string;
  totalFiles: number;
  totalBytes: number;
  urls: OfflineManifestEntry[];
}

interface OfflineSiteCachePanelProps {
  baseUrl: string;
}

type PanelStatus = 'loading' | 'ready' | 'downloading' | 'complete' | 'error' | 'unsupported' | 'clearing';

const FULL_SITE_CACHE_PREFIX = 'propaedia-full-site-';
const OFFLINE_DOWNLOAD_HEADER = 'X-Propaedia-Offline-Download';
const DOWNLOAD_CONCURRENCY = 6;

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function currentCacheName(version: string): string {
  return `${FULL_SITE_CACHE_PREFIX}${version}`;
}

async function deleteOfflineCaches(keepName?: string): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(FULL_SITE_CACHE_PREFIX) && name !== keepName)
      .map((name) => caches.delete(name)),
  );
}

async function readCacheProgress(manifest: OfflineManifest): Promise<{ count: number; bytes: number }> {
  const cache = await caches.open(currentCacheName(manifest.version));
  const keys = await cache.keys();
  const cachedUrls = new Set(keys.map((request) => request.url));

  let count = 0;
  let bytes = 0;

  manifest.urls.forEach((entry) => {
    const absoluteUrl = new URL(entry.url, window.location.origin).href;
    if (!cachedUrls.has(absoluteUrl)) return;
    count += 1;
    bytes += entry.bytes;
  });

  return { count, bytes };
}

export default function OfflineSiteCachePanel({ baseUrl }: OfflineSiteCachePanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [manifest, setManifest] = useState<OfflineManifest | null>(null);
  const [cachedCount, setCachedCount] = useState(0);
  const [cachedBytes, setCachedBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const downloadRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('caches' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch(joinBaseUrl(baseUrl, 'offline-manifest.json'));
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(
              'The offline manifest is not available on the dev server. Test full-site download from a built site, or run npm run build to generate offline-manifest.json.',
            );
          }

          throw new Error('Could not load the offline manifest.');
        }

        const nextManifest = await response.json() as OfflineManifest;
        await deleteOfflineCaches(currentCacheName(nextManifest.version));
        const progress = await readCacheProgress(nextManifest);
        if (cancelled) return;

        setManifest(nextManifest);
        setCachedCount(progress.count);
        setCachedBytes(progress.bytes);
        setStatus(progress.count >= nextManifest.totalFiles ? 'complete' : 'ready');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : 'Could not load the offline manifest.');
        setStatus('error');
      }
    }

    void loadManifest();

    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const progressPercent = useMemo(() => {
    if (!manifest || manifest.totalFiles === 0) return 0;
    return Math.min(100, Math.round((cachedCount / manifest.totalFiles) * 100));
  }, [cachedCount, manifest]);

  async function refreshProgress(nextManifest: OfflineManifest) {
    const progress = await readCacheProgress(nextManifest);
    setCachedCount(progress.count);
    setCachedBytes(progress.bytes);
    setStatus(progress.count >= nextManifest.totalFiles ? 'complete' : 'ready');
  }

  async function handleDownload() {
    if (!manifest || downloadRef.current) return;

    downloadRef.current = true;
    setStatus('downloading');
    setErrorMessage(null);

    try {
      await deleteOfflineCaches(currentCacheName(manifest.version));
      const cache = await caches.open(currentCacheName(manifest.version));
      const existingProgress = await readCacheProgress(manifest);

      let nextCount = existingProgress.count;
      let nextBytes = existingProgress.bytes;
      setCachedCount(nextCount);
      setCachedBytes(nextBytes);

      const existingKeys = await cache.keys();
      const existingUrls = new Set(existingKeys.map((request) => request.url));
      const queue = manifest.urls.filter((entry) => !existingUrls.has(new URL(entry.url, window.location.origin).href));

      let nextIndex = 0;
      const failures: string[] = [];

      async function processEntry(entry: OfflineManifestEntry) {
        const cacheKey = entry.url;
        const cachedResponse = await caches.match(cacheKey, { ignoreSearch: false });

        if (cachedResponse) {
          await cache.put(cacheKey, cachedResponse.clone());
        } else {
          const response = await fetch(cacheKey, {
            headers: {
              [OFFLINE_DOWNLOAD_HEADER]: '1',
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to cache ${entry.url}`);
          }

          await cache.put(cacheKey, response.clone());
        }

        nextCount += 1;
        nextBytes += entry.bytes;
        setCachedCount(nextCount);
        setCachedBytes(nextBytes);
      }

      async function worker() {
        while (nextIndex < queue.length) {
          const entry = queue[nextIndex];
          nextIndex += 1;

          try {
            await processEntry(entry);
          } catch {
            failures.push(entry.url);
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length || 1) }, () => worker()),
      );

      if (failures.length > 0) {
        setErrorMessage(`Cached ${nextCount}/${manifest.totalFiles} files. ${failures.length} files failed; press Download again to resume.`);
        setStatus('error');
      } else {
        setStatus('complete');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not finish the offline download.');
      setStatus('error');
    } finally {
      downloadRef.current = false;
    }
  }

  async function handleClear() {
    if (!manifest) return;

    setStatus('clearing');
    setErrorMessage(null);
    await deleteOfflineCaches();
    await refreshProgress(manifest);
  }

  if (status === 'unsupported') {
    return (
      <div class="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900">
        This browser does not expose the storage APIs needed for a full offline download.
      </div>
    );
  }

  if (status === 'loading' || !manifest) {
    if (status === 'error') {
      return (
        <div class="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700">
          {errorMessage || 'Could not load the offline manifest.'}
        </div>
      );
    }

    if (!manifest) {
      return (
        <div class="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700">
          Could not load the offline manifest.
        </div>
      );
    }

    return (
      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-600">
        Loading offline download details...
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-2">
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Full Offline Cache
            </p>
            <h2 class="font-serif text-2xl text-slate-900">Download the full site for offline use</h2>
            <p class="text-sm leading-6 text-slate-600">
              This saves the current static build into browser storage so the whole site stays available without a network connection.
              It is best used on desktop or on a device with plenty of free storage.
            </p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p><span class="font-medium text-slate-900">{manifest.totalFiles.toLocaleString()}</span> files</p>
            <p><span class="font-medium text-slate-900">{formatBytes(manifest.totalBytes)}</span> total</p>
          </div>
        </div>

        <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-medium text-slate-900">
                {status === 'complete' ? 'Full offline download is ready.' : 'Download status'}
              </p>
              <p class="mt-1 text-sm text-slate-600">
                {cachedCount.toLocaleString()} / {manifest.totalFiles.toLocaleString()} files cached
                {' · '}
                {formatBytes(cachedBytes)} / {formatBytes(manifest.totalBytes)}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={status === 'downloading' || status === 'clearing'}
                class="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {status === 'complete'
                  ? 'Re-download full site'
                  : status === 'downloading'
                    ? 'Downloading...'
                    : cachedCount > 0
                      ? 'Resume download'
                      : 'Download full site'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={status === 'downloading' || status === 'clearing' || cachedCount === 0}
                class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {status === 'clearing' ? 'Clearing...' : 'Clear offline download'}
              </button>
            </div>
          </div>

          <div class="mt-4">
            <div class="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                class="h-full rounded-full bg-slate-900 transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p class="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">{progressPercent}% cached</p>
          </div>

          {errorMessage ? (
            <div class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="font-serif text-xl text-slate-900">What this changes</h3>
        <div class="mt-3 space-y-3 text-sm leading-6 text-slate-600">
          <p>
            The normal install flow already keeps the homepage, About page, Part pages, and Division pages available offline.
            This download adds the rest of the site: Section pages, reading libraries, reading detail pages, search assets, and the client-side data files behind them.
          </p>
          <p>
            Query-string views such as essay tabs on Part pages will use the cached page shell offline as well.
            If the site updates later, press Re-download full site to refresh the cached version.
          </p>
        </div>
      </section>
    </div>
  );
}
