export type WikipediaKnowledgeLevel = 1 | 2 | 3;
export interface WikipediaLevelEntry {
  lowestLevel?: number;
}

const STORAGE_KEY = 'propaedia-wiki-level';
const CHANGE_EVENT = 'propaedia:wikipedia-level-change';

export function getStoredWikipediaLevel(): WikipediaKnowledgeLevel {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1' || stored === '2' || stored === '3') {
    return Number(stored) as WikipediaKnowledgeLevel;
  }
  return 3;
}

export function setStoredWikipediaLevel(level: WikipediaKnowledgeLevel): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(level));
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: level }));
}

export function subscribeWikipediaLevel(
  callback: (level: WikipediaKnowledgeLevel) => void,
): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<WikipediaKnowledgeLevel>).detail);
  };
  document.addEventListener(CHANGE_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    if (event.newValue === '1' || event.newValue === '2' || event.newValue === '3') {
      callback(Number(event.newValue) as WikipediaKnowledgeLevel);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function wikipediaLevelName(level: WikipediaKnowledgeLevel): string {
  if (level === 1) return 'Level 1';
  if (level === 2) return 'Level 2';
  return 'Level 3';
}

export function wikipediaLevelCount(level: WikipediaKnowledgeLevel): string {
  if (level === 1) return '10';
  if (level === 2) return '100';
  return '1,000';
}

export function wikipediaLevelLabel(level: WikipediaKnowledgeLevel): string {
  return `${wikipediaLevelName(level)} (Top ${wikipediaLevelCount(level)})`;
}

export function matchesWikipediaLevel(
  entry: WikipediaLevelEntry,
  level: WikipediaKnowledgeLevel,
): boolean {
  return (entry.lowestLevel ?? 3) <= level;
}

export function filterWikipediaLevel<T extends WikipediaLevelEntry>(
  entries: T[],
  level: WikipediaKnowledgeLevel,
): T[] {
  return entries.filter((entry) => matchesWikipediaLevel(entry, level));
}
