import type { ReadingSectionSummary } from './readingData';

export interface ChecklistBackedReadingEntry {
  checklistKey: string;
  sections: ReadingSectionSummary[];
}

export interface CoverageRing {
  label: string;
  count: number;
  total: number;
  color: string;
}

export function completedChecklistKeysFromState(checklistState: Record<string, boolean>): Set<string> {
  return new Set(Object.keys(checklistState).filter((key) => checklistState[key] === true));
}

export function countCompletedEntries<T extends { checklistKey: string }>(
  entries: T[],
  checklistState: Record<string, boolean>
): number {
  return entries.filter((entry) => Boolean(checklistState[entry.checklistKey])).length;
}

export function buildCoverageRings<T extends ChecklistBackedReadingEntry>(
  entries: T[],
  checklistState: Record<string, boolean>,
  options: {
    outlineItemCounts?: Record<string, number>;
    totalOutlineItems?: number;
  } = {}
): CoverageRing[] {
  const allParts = new Set<number>();
  const allDivisions = new Set<string>();
  const allSections = new Set<string>();
  const coveredParts = new Set<number>();
  const coveredDivisions = new Set<string>();
  const coveredSections = new Set<string>();

  for (const entry of entries) {
    const isChecked = Boolean(checklistState[entry.checklistKey]);
    for (const section of entry.sections) {
      allParts.add(section.partNumber);
      allDivisions.add(section.divisionId);
      allSections.add(section.sectionCode);
      if (isChecked) {
        coveredParts.add(section.partNumber);
        coveredDivisions.add(section.divisionId);
        coveredSections.add(section.sectionCode);
      }
    }
  }

  let coveredOutlineItems = 0;
  if (options.outlineItemCounts) {
    for (const code of coveredSections) {
      coveredOutlineItems += options.outlineItemCounts[code] || 0;
    }
  }

  return [
    { label: 'Parts', count: coveredParts.size, total: allParts.size, color: '#6366f1' },
    { label: 'Divisions', count: coveredDivisions.size, total: allDivisions.size, color: '#8b5cf6' },
    { label: 'Sections', count: coveredSections.size, total: allSections.size, color: '#a78bfa' },
    ...(options.totalOutlineItems
      ? [{ label: 'Sub-sections', count: coveredOutlineItems, total: options.totalOutlineItems, color: '#c4b5fd' }]
      : []),
  ];
}
