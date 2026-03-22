import type { ReadingSectionSummary } from './readingData';

export interface ChecklistBackedReadingEntry {
  checklistKey: string;
  sections: ReadingSectionSummary[];
  subsectionKeys?: string[];
}

export interface CoverageRing {
  label: string;
  count: number;
  total: number;
  color: string;
}

export type CoverageLayer = 'part' | 'division' | 'section' | 'subsection';

export const COVERAGE_LAYER_ORDER: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];

export const COVERAGE_LAYER_META: Record<CoverageLayer, {
  label: string;
  pluralLabel: string;
  shortLabel: string;
}> = {
  part: {
    label: 'Part',
    pluralLabel: 'Parts',
    shortLabel: 'Parts',
  },
  division: {
    label: 'Division',
    pluralLabel: 'Divisions',
    shortLabel: 'Divisions',
  },
  section: {
    label: 'Section',
    pluralLabel: 'Sections',
    shortLabel: 'Sections',
  },
  subsection: {
    label: 'Subsection',
    pluralLabel: 'Subsections',
    shortLabel: 'Subsections',
  },
};

export function coverageLayerLabel(layer: CoverageLayer, count: number, options: {
  lowercase?: boolean;
} = {}): string {
  const meta = COVERAGE_LAYER_META[layer];
  const label = count === 1 ? meta.label : meta.pluralLabel;
  return options.lowercase ? label.toLowerCase() : label;
}

export function countEntryCoverageForLayer(
  entry: ChecklistBackedReadingEntry,
  layer: CoverageLayer,
  options: {
    outlineItemCounts?: Record<string, number>;
  } = {}
): number {
  const targetKeys = uniqueTargetKeysForEntry(entry, layer);
  return targetKeys.reduce(
    (total, key) => total + coverageWeightForKey(key, layer, options),
    0
  );
}

export interface LayerCoveragePathStep<TEntry extends ChecklistBackedReadingEntry> {
  entry: TEntry;
  newCoverageCount: number;
  cumulativeCoveredCount: number;
  newSections: ReadingSectionSummary[];
}

export interface LayerCoverageSnapshot<TEntry extends ChecklistBackedReadingEntry> {
  layer: CoverageLayer;
  totalEntries: number;
  completedEntries: number;
  totalCoverageCount: number;
  currentlyCoveredCount: number;
  remainingCoverageCount: number;
  path: Array<LayerCoveragePathStep<TEntry>>;
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

function coverageKeyForSection(section: ReadingSectionSummary, layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return String(section.partNumber);
    case 'division':
      return section.divisionId;
    case 'section':
    case 'subsection':
    default:
      return section.sectionCode;
  }
}

function coverageWeightForKey(
  key: string,
  layer: CoverageLayer,
  options: {
    outlineItemCounts?: Record<string, number>;
  }
): number {
  if (layer !== 'subsection') return 1;
  if (key.includes('::')) return 1;
  return options.outlineItemCounts?.[key] ?? 1;
}

function uniqueTargetKeysForEntry(
  entry: ChecklistBackedReadingEntry,
  layer: CoverageLayer
): string[] {
  if (layer === 'subsection' && entry.subsectionKeys && entry.subsectionKeys.length > 0) {
    return Array.from(new Set(entry.subsectionKeys));
  }

  return Array.from(new Set(entry.sections.map((section) => coverageKeyForSection(section, layer))));
}

function sectionMatchesTargetKey(
  section: ReadingSectionSummary,
  layer: CoverageLayer,
  targetKey: string
): boolean {
  if (layer === 'subsection') {
    return targetKey === section.sectionCode || targetKey.startsWith(`${section.sectionCode}::`);
  }

  return coverageKeyForSection(section, layer) === targetKey;
}

function dedupeSections(sections: ReadingSectionSummary[]): ReadingSectionSummary[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    if (seen.has(section.sectionCode)) return false;
    seen.add(section.sectionCode);
    return true;
  });
}

function sectionSpreadScore(sections: ReadingSectionSummary[]): number {
  const parts = new Set(sections.map((section) => section.partNumber));
  const divisions = new Set(sections.map((section) => section.divisionId));
  const sectionCodes = new Set(sections.map((section) => section.sectionCode));
  return parts.size * 10000 + divisions.size * 100 + sectionCodes.size;
}

export function buildLayerCoverageSnapshot<TEntry extends ChecklistBackedReadingEntry & {
  title: string;
  sectionCount: number;
}>(
  entries: TEntry[],
  completedChecklistKeys: Set<string>,
  layer: CoverageLayer,
  options: {
    outlineItemCounts?: Record<string, number>;
  } = {}
): LayerCoverageSnapshot<TEntry> {
  const totalTargets = new Map<string, number>();
  const coveredTargets = new Set<string>();
  let completedEntries = 0;

  for (const entry of entries) {
    const targetKeys = uniqueTargetKeysForEntry(entry, layer);
    targetKeys.forEach((key) => {
      if (!totalTargets.has(key)) {
        totalTargets.set(key, coverageWeightForKey(key, layer, options));
      }
    });

    if (!completedChecklistKeys.has(entry.checklistKey)) continue;
    completedEntries += 1;
    targetKeys.forEach((key) => coveredTargets.add(key));
  }

  const countTargets = (keys: Iterable<string>): number => {
    let total = 0;
    for (const key of keys) {
      total += totalTargets.get(key) ?? coverageWeightForKey(key, layer, options);
    }
    return total;
  };

  const currentlyCoveredCount = countTargets(coveredTargets);
  const totalCoverageCount = countTargets(totalTargets.keys());
  const remainingEntries = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey));
  const usedChecklistKeys = new Set<string>();
  const path: Array<LayerCoveragePathStep<TEntry>> = [];

  while (usedChecklistKeys.size < remainingEntries.length) {
    let bestEntry: TEntry | null = null;
    let bestNewCoverageCount = -1;
    let bestNewSections: ReadingSectionSummary[] = [];
    let bestTargetKeys: string[] = [];

    for (const entry of remainingEntries) {
      if (usedChecklistKeys.has(entry.checklistKey)) continue;

      const newTargetKeys = uniqueTargetKeysForEntry(entry, layer)
        .filter((key) => !coveredTargets.has(key));
      const newCoverageCount = newTargetKeys.reduce(
        (total, key) => total + (totalTargets.get(key) ?? coverageWeightForKey(key, layer, options)),
        0
      );
      const newSections = dedupeSections(
        entry.sections.filter((section) => newTargetKeys.some((key) => sectionMatchesTargetKey(section, layer, key)))
      );

      if (!bestEntry || newCoverageCount > bestNewCoverageCount) {
        bestEntry = entry;
        bestNewCoverageCount = newCoverageCount;
        bestNewSections = newSections;
        bestTargetKeys = newTargetKeys;
        continue;
      }

      if (newCoverageCount === bestNewCoverageCount) {
        const spreadScore = sectionSpreadScore(newSections);
        const bestSpreadScore = sectionSpreadScore(bestNewSections);

        if (spreadScore > bestSpreadScore) {
          bestEntry = entry;
          bestNewCoverageCount = newCoverageCount;
          bestNewSections = newSections;
          bestTargetKeys = newTargetKeys;
          continue;
        }

        if (spreadScore === bestSpreadScore && entry.sectionCount > bestEntry.sectionCount) {
          bestEntry = entry;
          bestNewCoverageCount = newCoverageCount;
          bestNewSections = newSections;
          bestTargetKeys = newTargetKeys;
        }
      }
    }

    if (!bestEntry || bestNewCoverageCount <= 0) break;

    usedChecklistKeys.add(bestEntry.checklistKey);
    bestTargetKeys.forEach((key) => coveredTargets.add(key));

    path.push({
      entry: bestEntry,
      newCoverageCount: bestNewCoverageCount,
      cumulativeCoveredCount: countTargets(coveredTargets),
      newSections: bestNewSections,
    });
  }

  return {
    layer,
    totalEntries: entries.length,
    completedEntries,
    totalCoverageCount,
    currentlyCoveredCount,
    remainingCoverageCount: Math.max(0, totalCoverageCount - currentlyCoveredCount),
    path,
  };
}

export function selectDefaultCoverageLayer(
  snapshots: Array<Pick<LayerCoverageSnapshot<ChecklistBackedReadingEntry>, 'layer' | 'currentlyCoveredCount' | 'totalCoverageCount'>>
): CoverageLayer {
  for (const layer of COVERAGE_LAYER_ORDER) {
    const snapshot = snapshots.find((candidate) => candidate.layer === layer);
    if (snapshot && snapshot.currentlyCoveredCount < snapshot.totalCoverageCount) {
      return layer;
    }
  }

  return snapshots[snapshots.length - 1]?.layer ?? 'section';
}

export function buildCoverageRings<T extends ChecklistBackedReadingEntry>(
  entries: T[],
  checklistState: Record<string, boolean>,
  options: {
    outlineItemCounts?: Record<string, number>;
    totalOutlineItems?: number;
    includeSubsections?: boolean;
  } = {}
): CoverageRing[] {
  const allParts = new Set<number>();
  const allDivisions = new Set<string>();
  const allSections = new Set<string>();
  const allSubsectionKeys = new Set<string>();
  const coveredSubsectionKeys = new Set<string>();
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

    for (const subsectionKey of entry.subsectionKeys ?? []) {
      allSubsectionKeys.add(subsectionKey);
    }

    if (isChecked) {
      for (const subsectionKey of entry.subsectionKeys ?? []) {
        coveredSubsectionKeys.add(subsectionKey);
      }
    }
  }

  const includeSubsections = options.includeSubsections !== false;
  let coveredOutlineItems = 0;
  let totalSubsectionItems = options.totalOutlineItems ?? 0;
  if (includeSubsections && allSubsectionKeys.size > 0) {
    totalSubsectionItems = allSubsectionKeys.size;
  }
  if (includeSubsections && coveredSubsectionKeys.size > 0) {
    coveredOutlineItems = coveredSubsectionKeys.size;
  } else if (includeSubsections && options.outlineItemCounts) {
    for (const code of coveredSections) {
      coveredOutlineItems += options.outlineItemCounts[code] || 0;
    }
  }

  return [
    { label: 'Parts', count: coveredParts.size, total: allParts.size, color: '#6366f1' },
    { label: 'Divisions', count: coveredDivisions.size, total: allDivisions.size, color: '#8b5cf6' },
    { label: 'Sections', count: coveredSections.size, total: allSections.size, color: '#a78bfa' },
    ...(includeSubsections && totalSubsectionItems > 0
      ? [{ label: 'Subsections', count: coveredOutlineItems, total: totalSubsectionItems, color: '#c4b5fd' }]
      : []),
  ];
}
