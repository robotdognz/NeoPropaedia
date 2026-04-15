import type { ChecklistBackedReadingEntry, CoverageRing } from './readingLibrary';
import type { OutlineProgressTargets } from './outlineProgressTargets';

const OUTLINE_PROGRESS_RING_COLORS = {
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
): CoverageRing[] {
  const rings: CoverageRing[] = [];

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
): string {
  const rings = buildOutlineProgressRings(targets, coverageState);

  return rings
    .map((ring) => `${ring.label} ${ring.count}/${ring.total}`)
    .join(' · ');
}
