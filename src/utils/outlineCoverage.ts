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
  const validSectionPaths = sectionOutlinePathIndex[sectionCode] ?? [];
  const normalizedRelevantPaths = Array.from(new Set(
    (relevantPaths ?? [])
      .map((path) => normalizeOutlinePath(path))
      .filter(Boolean)
  ));

  const validPathSet = new Set(validSectionPaths);
  const matchedRelevantPaths = normalizedRelevantPaths.filter((path) => (
    validPathSet.size === 0 || validPathSet.has(path)
  ));

  const pathsToUse = matchedRelevantPaths.length > 0
    ? matchedRelevantPaths
    : normalizedRelevantPaths.length > 0
      ? normalizedRelevantPaths
      : validSectionPaths;

  return pathsToUse.map((path) => `${sectionCode}::${path}`);
}
