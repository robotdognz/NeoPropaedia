const STORAGE_KEY = 'propaedia-reading-speed-wpm';
const CHANGE_EVENT = 'propaedia:reading-speed-change';

export const DEFAULT_READING_SPEED_WPM = 238;
export const MIN_READING_SPEED_WPM = 80;
export const MAX_READING_SPEED_WPM = 600;

const numberFormatter = new Intl.NumberFormat('en-US');

function clampReadingSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_READING_SPEED_WPM;
  return Math.min(MAX_READING_SPEED_WPM, Math.max(MIN_READING_SPEED_WPM, Math.round(value)));
}

export function normalizeReadingSpeedInput(value: number | string | null | undefined): number {
  if (typeof value === 'number') return clampReadingSpeed(value);
  if (typeof value === 'string') return clampReadingSpeed(Number(value));
  return DEFAULT_READING_SPEED_WPM;
}

export function getReadingSpeedWpm(): number {
  if (typeof window === 'undefined') return DEFAULT_READING_SPEED_WPM;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_READING_SPEED_WPM;
    return normalizeReadingSpeedInput(stored);
  } catch {
    return DEFAULT_READING_SPEED_WPM;
  }
}

export function setReadingSpeedWpm(value: number | string): number {
  const next = normalizeReadingSpeedInput(value);
  if (typeof window === 'undefined') return next;

  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Ignore storage failures and keep the UI interactive.
  }

  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  return next;
}

export function subscribeReadingSpeed(callback: (wpm: number) => void): () => void {
  const handler = (event: Event) => {
    callback(normalizeReadingSpeedInput((event as CustomEvent<number>).detail));
  };
  document.addEventListener(CHANGE_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    callback(normalizeReadingSpeedInput(event.newValue));
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function formatReadingSpeedWpm(wpm: number): string {
  return `${numberFormatter.format(normalizeReadingSpeedInput(wpm))} wpm`;
}

export function estimateReadingMinutes(wordCount?: number, readingSpeedWpm = DEFAULT_READING_SPEED_WPM): number | undefined {
  if (!wordCount || wordCount <= 0) return undefined;
  const safeSpeed = normalizeReadingSpeedInput(readingSpeedWpm);
  return wordCount / safeSpeed;
}

export function formatEstimatedReadingTime(wordCount?: number, readingSpeedWpm = DEFAULT_READING_SPEED_WPM): string | undefined {
  const minutes = estimateReadingMinutes(wordCount, readingSpeedWpm);
  if (!minutes || minutes <= 0) return undefined;

  return formatEstimatedMinutes(minutes);
}

export function formatEstimatedMinutes(minutes?: number, approximate = true): string | undefined {
  if (!minutes || minutes <= 0) return undefined;

  const roundedMinutes = Math.round(minutes);
  if (roundedMinutes <= 0) return '<1 min';
  const prefix = approximate ? '~' : '';
  if (roundedMinutes < 60) return `${prefix}${roundedMinutes} min`;

  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (remainingMinutes === 0) {
    return `${prefix}${hours}h`;
  }

  return `${prefix}${hours}h ${remainingMinutes}m`;
}

export function estimateReadingSpeedFromSample(wordsRead?: number, elapsedSeconds?: number): number | undefined {
  if (!wordsRead || wordsRead <= 0 || !elapsedSeconds || elapsedSeconds <= 0) return undefined;
  return normalizeReadingSpeedInput((wordsRead / elapsedSeconds) * 60);
}

export { STORAGE_KEY as READING_SPEED_STORAGE_KEY };
