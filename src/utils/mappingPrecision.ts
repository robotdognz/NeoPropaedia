import { normalizeOutlinePath } from './helpers';
import { recommendationFlag, type RecommendationCardFlag } from './recommendationCardMeta';

export type MappingPrecisionKind =
  | 'exact-path'
  | 'broader-path'
  | 'mapped-paths'
  | 'section-fallback'
  | 'related-topic';

export function classifyMappingPrecision(
  relevantPaths: string[] | undefined,
  selectedOutlinePath?: string | null
): MappingPrecisionKind {
  const normalizedPaths = Array.from(new Set(
    (relevantPaths ?? [])
      .map((path) => normalizeOutlinePath(path))
      .filter(Boolean)
  ));

  if (!selectedOutlinePath) {
    return normalizedPaths.length > 0 ? 'mapped-paths' : 'section-fallback';
  }

  const normalizedSelection = normalizeOutlinePath(selectedOutlinePath);
  if (normalizedPaths.some((path) => path === normalizedSelection)) {
    return 'exact-path';
  }

  if (normalizedPaths.some((path) => (
    normalizedSelection.startsWith(`${path}.`) || path.startsWith(`${normalizedSelection}.`)
  ))) {
    return 'broader-path';
  }

  if (normalizedPaths.length === 0) {
    return 'section-fallback';
  }

  return 'related-topic';
}

export function mappingPrecisionFlag(kind: MappingPrecisionKind): RecommendationCardFlag {
  switch (kind) {
    case 'exact-path':
      return recommendationFlag('Exact path', 'success');
    case 'broader-path':
      return recommendationFlag('Broader path', 'warning');
    case 'mapped-paths':
      return recommendationFlag('Mapped paths', 'info');
    case 'section-fallback':
      return recommendationFlag('Section-level only', 'muted');
    case 'related-topic':
    default:
      return recommendationFlag('Related topic', 'topic');
  }
}

export function subsectionPrecisionSummary(entry: {
  mappedPathCount?: number;
  mappedPathSectionCount?: number;
  fallbackSectionCount?: number;
}): string | null {
  const mappedPathCount = entry.mappedPathCount ?? 0;
  const mappedPathSectionCount = entry.mappedPathSectionCount ?? 0;
  const fallbackSectionCount = entry.fallbackSectionCount ?? 0;

  const parts: string[] = [];
  if (mappedPathCount > 0) {
    parts.push(
      `${mappedPathCount} mapped ${mappedPathCount === 1 ? 'Subsection path' : 'Subsection paths'} in ${mappedPathSectionCount} ${mappedPathSectionCount === 1 ? 'Section' : 'Sections'}`
    );
  }
  if (fallbackSectionCount > 0) {
    parts.push(
      `broader Section coverage in ${fallbackSectionCount} ${fallbackSectionCount === 1 ? 'Section' : 'Sections'}`
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
