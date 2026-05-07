import type { ChecklistBackedReadingEntry, CoverageRing } from './readingLibrary';
import type { OutlineProgressTargets } from './outlineProgressTargets';

const OUTLINE_PROGRESS_RING_COLORS = {
  readings: '#334155',
  part: '#6366f1',
  division: '#8b5cf6',
  section: '#a78bfa',
  subsection: '#c4b5fd',
} as const;

export interface OutlineProgressCoverageState {
  coveredPartKeys: Set<string>;
  coveredDivisionKeys: Set<string>;
  coveredSectionKeys: Set<string>;
  coveredSubsectionKeys: Set<string>;
}

interface OutlineReadingCompletionCounts {
  total: number;
  completed: number;
}

export interface OutlineProgressReadingCompletionState {
  partCounts: Map<string, OutlineReadingCompletionCounts>;
  divisionCounts: Map<string, OutlineReadingCompletionCounts>;
  sectionCounts: Map<string, OutlineReadingCompletionCounts>;
}

function incrementReadingCompletionCount(
  map: Map<string, OutlineReadingCompletionCounts>,
  key: string,
  completed: boolean,
) {
  const current = map.get(key) ?? { total: 0, completed: 0 };
  current.total += 1;
  if (completed) current.completed += 1;
  map.set(key, current);
}

export function buildOutlineProgressCoverageState(
  entries: ChecklistBackedReadingEntry[],
  completedChecklistKeys: Set<string>,
): OutlineProgressCoverageState {
  const coveredPartKeys = new Set<string>();
  const coveredDivisionKeys = new Set<string>();
  const coveredSectionKeys = new Set<string>();
  const coveredSubsectionKeys = new Set<string>();

  for (const entry of entries) {
    if (!completedChecklistKeys.has(entry.checklistKey)) continue;

    for (const section of entry.sections) {
      coveredPartKeys.add(String(section.partNumber));
      coveredDivisionKeys.add(section.divisionId);
      coveredSectionKeys.add(section.sectionCode);
    }

    for (const subsectionKey of entry.progressSubsectionKeys ?? []) {
      coveredSubsectionKeys.add(subsectionKey);
    }
  }

  return {
    coveredPartKeys,
    coveredDivisionKeys,
    coveredSectionKeys,
    coveredSubsectionKeys,
  };
}

export function buildOutlineProgressReadingCompletionState(
  entries: ChecklistBackedReadingEntry[],
  completedChecklistKeys: Set<string>,
): OutlineProgressReadingCompletionState {
  const partCounts = new Map<string, OutlineReadingCompletionCounts>();
  const divisionCounts = new Map<string, OutlineReadingCompletionCounts>();
  const sectionCounts = new Map<string, OutlineReadingCompletionCounts>();

  for (const entry of entries) {
    const completed = completedChecklistKeys.has(entry.checklistKey);
    const touchedParts = new Set<string>();
    const touchedDivisions = new Set<string>();
    const touchedSections = new Set<string>();

    for (const section of entry.sections) {
      touchedParts.add(String(section.partNumber));
      touchedDivisions.add(section.divisionId);
      touchedSections.add(section.sectionCode);
    }

    for (const key of touchedParts) {
      incrementReadingCompletionCount(partCounts, key, completed);
    }
    for (const key of touchedDivisions) {
      incrementReadingCompletionCount(divisionCounts, key, completed);
    }
    for (const key of touchedSections) {
      incrementReadingCompletionCount(sectionCounts, key, completed);
    }
  }

  return {
    partCounts,
    divisionCounts,
    sectionCounts,
  };
}

function readingCompletionRingForTarget(
  targets: OutlineProgressTargets,
  completionState: OutlineProgressReadingCompletionState,
): CoverageRing | null {
  const counts =
    targets.ownLayer === 'part'
      ? completionState.partCounts.get(targets.ownKey)
      : targets.ownLayer === 'division'
        ? completionState.divisionCounts.get(targets.ownKey)
        : completionState.sectionCounts.get(targets.ownKey);

  if (!counts || counts.total === 0) return null;

  return {
    label: 'Readings',
    count: counts.completed,
    total: counts.total,
    color: OUTLINE_PROGRESS_RING_COLORS.readings,
  };
}

function countCoveredTargets(targetKeys: string[], coveredKeys: Set<string>): number {
  let coveredCount = 0;

  for (const key of targetKeys) {
    if (coveredKeys.has(key)) {
      coveredCount += 1;
    }
  }

  return coveredCount;
}

export function buildOutlineProgressRings(
  targets: OutlineProgressTargets,
  coverageState: OutlineProgressCoverageState,
  completionState?: OutlineProgressReadingCompletionState | null,
): CoverageRing[] {
  const rings: CoverageRing[] = [];

  const readingCompletionRing =
    completionState ? readingCompletionRingForTarget(targets, completionState) : null;
  if (readingCompletionRing) {
    rings.push(readingCompletionRing);
  }

  if (targets.ownLayer === 'part') {
    rings.push({
      label: 'Divisions',
      count: countCoveredTargets(targets.divisionIds, coverageState.coveredDivisionKeys),
      total: targets.divisionIds.length,
      color: OUTLINE_PROGRESS_RING_COLORS.division,
    });
    rings.push({
      label: 'Sections',
      count: countCoveredTargets(targets.sectionCodes, coverageState.coveredSectionKeys),
      total: targets.sectionCodes.length,
      color: OUTLINE_PROGRESS_RING_COLORS.section,
    });
  }

  if (targets.ownLayer === 'division') {
    rings.push({
      label: 'Sections',
      count: countCoveredTargets(targets.sectionCodes, coverageState.coveredSectionKeys),
      total: targets.sectionCodes.length,
      color: OUTLINE_PROGRESS_RING_COLORS.section,
    });
  }

  if (targets.ownLayer === 'section' && targets.subsectionKeys.length === 0) {
    rings.push({
      label: 'Section',
      count: coverageState.coveredSectionKeys.has(targets.ownKey) ? 1 : 0,
      total: 1,
      color: OUTLINE_PROGRESS_RING_COLORS.section,
    });
  }

  if (targets.subsectionKeys.length > 0) {
    rings.push({
      label: 'Subsections',
      count: countCoveredTargets(targets.subsectionKeys, coverageState.coveredSubsectionKeys),
      total: targets.subsectionKeys.length,
      color: OUTLINE_PROGRESS_RING_COLORS.subsection,
    });
  }

  return rings.filter((ring) => ring.total > 0);
}

export function describeOutlineProgress(
  targets: OutlineProgressTargets,
  coverageState: OutlineProgressCoverageState,
  completionState?: OutlineProgressReadingCompletionState | null,
): string {
  const rings = buildOutlineProgressRings(targets, coverageState, completionState);

  return rings
    .map((ring) => `${ring.label} ${ring.count}/${ring.total}`)
    .join(' · ');
}
