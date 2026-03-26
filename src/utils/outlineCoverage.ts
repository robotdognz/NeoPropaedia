import { normalizeOutlinePath } from './helpers';

interface OutlineNode {
  level?: string;
  children?: OutlineNode[];
}

interface SectionOutlineSource {
  sectionCode: string;
  outline: OutlineNode[];
}

function countOutlineItems(nodes: OutlineNode[] = []): number {
  let count = 0;

  for (const node of nodes) {
    count += 1;
    count += countOutlineItems(node.children ?? []);
  }

  return count;
}

function collectOutlinePaths(nodes: OutlineNode[] = [], ancestors: string[] = []): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    const level = normalizeOutlinePath(node.level ?? '');
    if (!level) {
      paths.push(...collectOutlinePaths(node.children ?? [], ancestors));
      continue;
    }

    const outlinePath = [...ancestors, level].join('.');
    paths.push(outlinePath);
    paths.push(...collectOutlinePaths(node.children ?? [], [...ancestors, level]));
  }

  return paths;
}

export function buildOutlineItemCoverage(sections: SectionOutlineSource[]): {
  outlineItemCounts: Record<string, number>;
  totalOutlineItems: number;
} {
  const outlineItemCounts: Record<string, number> = {};
  let totalOutlineItems = 0;

  for (const section of sections) {
    const count = countOutlineItems(section.outline);
    outlineItemCounts[section.sectionCode] = count;
    totalOutlineItems += count;
  }

  return {
    outlineItemCounts,
    totalOutlineItems,
  };
}

export function buildSectionOutlinePathIndex(sections: SectionOutlineSource[]): Record<string, string[]> {
  return Object.fromEntries(
    sections.map((section) => [
      section.sectionCode,
      Array.from(new Set(collectOutlinePaths(section.outline))),
    ])
  );
}

export function buildSubsectionCoverageKeys(
  sectionCode: string,
  relevantPaths: string[] | undefined,
  sectionOutlinePathIndex: Record<string, string[]>
): string[] {
  return analyzeMappedOutlinePathCoverage(sectionCode, relevantPaths, sectionOutlinePathIndex).coverageKeys;
}

function normalizeRelevantPaths(relevantPaths: string[] | undefined): string[] {
  return Array.from(new Set(
    (relevantPaths ?? [])
      .map((path) => normalizeOutlinePath(path))
      .filter(Boolean)
  ));
}

function resolveRelevantPathMatches(
  sectionCode: string,
  relevantPaths: string[] | undefined,
  sectionOutlinePathIndex: Record<string, string[]>
): {
  validSectionPaths: string[];
  normalizedRelevantPaths: string[];
  matchedRelevantPaths: string[];
} {
  const validSectionPaths = sectionOutlinePathIndex[sectionCode] ?? [];
  const normalizedRelevantPaths = normalizeRelevantPaths(relevantPaths);
  const validPathSet = new Set(validSectionPaths);
  const matchedRelevantPaths = normalizedRelevantPaths.filter((path) => (
    validPathSet.size === 0 || validPathSet.has(path)
  ));

  return {
    validSectionPaths,
    normalizedRelevantPaths,
    matchedRelevantPaths,
  };
}

function coverageKeysForPaths(sectionCode: string, paths: string[]): string[] {
  return paths.map((path) => `${sectionCode}::${path}`);
}

export function analyzeMappedOutlinePathCoverage(
  sectionCode: string,
  relevantPaths: string[] | undefined,
  sectionOutlinePathIndex: Record<string, string[]>
): {
  coverageKeys: string[];
  matchedPathKeys: string[];
  usedFallback: boolean;
} {
  const {
    validSectionPaths,
    normalizedRelevantPaths,
    matchedRelevantPaths,
  } = resolveRelevantPathMatches(sectionCode, relevantPaths, sectionOutlinePathIndex);

  const pathsToUse = matchedRelevantPaths.length > 0
    ? matchedRelevantPaths
    : normalizedRelevantPaths.length > 0
      ? normalizedRelevantPaths
      : validSectionPaths;

  const usedFallback = normalizedRelevantPaths.length === 0;

  return {
    coverageKeys: coverageKeysForPaths(sectionCode, pathsToUse),
    matchedPathKeys: coverageKeysForPaths(sectionCode, matchedRelevantPaths),
    usedFallback,
  };
}

export function analyzeProgressSubsectionCoverage(
  sectionCode: string,
  relevantPaths: string[] | undefined,
  sectionOutlinePathIndex: Record<string, string[]>
): {
  coverageKeys: string[];
  usedFallback: boolean;
} {
  const {
    normalizedRelevantPaths,
    matchedRelevantPaths,
  } = resolveRelevantPathMatches(sectionCode, relevantPaths, sectionOutlinePathIndex);

  const topLevelPaths = Array.from(new Set(
    matchedRelevantPaths
      .map((path) => normalizeOutlinePath(path.split('.')[0] ?? ''))
      .filter(Boolean)
  ));

  return {
    coverageKeys: coverageKeysForPaths(sectionCode, topLevelPaths),
    usedFallback: normalizedRelevantPaths.length === 0,
  };
}

export function analyzeSubsectionCoverage(
  sectionCode: string,
  relevantPaths: string[] | undefined,
  sectionOutlinePathIndex: Record<string, string[]>
): {
  coverageKeys: string[];
  matchedPathKeys: string[];
  usedFallback: boolean;
} {
  return analyzeMappedOutlinePathCoverage(sectionCode, relevantPaths, sectionOutlinePathIndex);
}
