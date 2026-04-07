import type { OutlineSelectionDetail } from './vsiOutlineFilter';
import { normalizeSectionCode } from './helpers';

const STORAGE_KEY_PREFIX = 'propaedia-section-outline-selection-v1:';

function selectionStorageKey(sectionCode: string): string {
  return `${STORAGE_KEY_PREFIX}${normalizeSectionCode(sectionCode)}`;
}

export function readSectionOutlineSelection(sectionCode: string): OutlineSelectionDetail | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(selectionStorageKey(sectionCode));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.sectionCode !== sectionCode) return null;
    if (typeof parsed.outlinePath !== 'string' || typeof parsed.text !== 'string') return null;

    return {
      sectionCode,
      outlinePath: parsed.outlinePath,
      text: parsed.text,
      childrenText: Array.isArray(parsed.childrenText)
        ? parsed.childrenText.filter((value: unknown): value is string => typeof value === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export function writeSectionOutlineSelection(detail: OutlineSelectionDetail): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(selectionStorageKey(detail.sectionCode), JSON.stringify(detail));
  } catch {
    // Ignore storage failures and keep outline selection interactive.
  }
}

export function clearSectionOutlineSelection(sectionCode: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(selectionStorageKey(sectionCode));
  } catch {
    // Ignore storage failures and keep outline selection interactive.
  }
}

