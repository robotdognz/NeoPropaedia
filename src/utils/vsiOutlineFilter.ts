export const OUTLINE_VSI_SELECT_EVENT = 'propaedia:outline-select';

export interface OutlineSelectionDetail {
  sectionCode: string;
  outlinePath: string;
  text: string;
}

export interface SearchableVsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationale: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeToken(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/['’]s$/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (normalized.length > 4 && normalized.endsWith('s')) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function tokenize(text: string): string[] {
  const unique = new Set<string>();

  for (const rawToken of text.split(/[^A-Za-z0-9.]+/)) {
    const token = normalizeToken(rawToken);
    if (!token || token.length < 3 || STOP_WORDS.has(token)) continue;
    unique.add(token);
  }

  return Array.from(unique);
}

function matchesOutlinePath(rationale: string, outlinePath: string): boolean {
  if (!outlinePath) return false;

  const escaped = escapeRegExp(outlinePath);
  const pathPattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?:\\.|[^A-Za-z0-9]|$)`, 'i');
  return pathPattern.test(rationale);
}

function scoreMapping(mapping: SearchableVsiMapping, selection: OutlineSelectionDetail): number {
  const searchableText = `${mapping.vsiTitle} ${mapping.vsiAuthor} ${mapping.rationale}`;
  const mappingTokens = new Set(tokenize(searchableText));
  const selectionTokens = tokenize(selection.text);

  let score = 0;

  if (matchesOutlinePath(mapping.rationale, selection.outlinePath)) {
    score += selection.outlinePath.includes('.') ? 5 : 4;
  }

  let matchedTokenCount = 0;
  for (const token of selectionTokens) {
    if (mappingTokens.has(token)) {
      matchedTokenCount += 1;
      score += token.length >= 8 ? 2 : 1;
    }
  }

  if (matchedTokenCount >= 2) {
    score += 2;
  }

  return score;
}

export function filterMappingsForOutline<T extends SearchableVsiMapping>(
  mappings: T[],
  selection: OutlineSelectionDetail
): T[] {
  const scoredMappings = mappings
    .map((mapping) => ({ mapping, score: scoreMapping(mapping, selection) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  return scoredMappings.map(({ mapping }) => mapping);
}
