/**
 * Normalize a section code for use in filenames and URLs.
 * Converts slashes to hyphens: "96/10" → "96-10"
 */
export function normalizeSectionCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/\//g, '-');
}

/**
 * Get the display form of a section code (preserves original slashes).
 */
export function displaySectionCode(code: string): string {
  return code.replace(/-/g, '/');
}

/**
 * Get the URL path for a section.
 */
export function sectionUrl(sectionCode: string, base = ''): string {
  return `${base}/section/${normalizeSectionCode(sectionCode)}`;
}

export function normalizeOutlinePath(path: string): string {
  return path.replace(/\s+/g, '').replace(/^\.+/, '').replace(/\.+$/, '');
}

export function outlineAnchorId(sectionCode: string, outlinePath: string): string {
  const normalizedPath = normalizeOutlinePath(outlinePath);

  return `outline-${normalizeSectionCode(sectionCode).toLowerCase()}-${normalizedPath
    .split('.')
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())
    .join('-')}`;
}

export function sectionReferenceUrl(sectionCode: string, outlinePath = '', base = ''): string {
  const url = sectionUrl(sectionCode, base);
  const normalizedPath = normalizeOutlinePath(outlinePath);

  return normalizedPath
    ? `${url}#${outlineAnchorId(sectionCode, normalizedPath)}`
    : url;
}

/**
 * Get the URL path for a division.
 */
export function divisionUrl(divisionId: string, base = ''): string {
  return `${base}/division/${divisionId}`;
}

/**
 * Get the URL path for a part.
 */
export function partUrl(partNumber: number, base = ''): string {
  return `${base}/part/${partNumber}`;
}

/**
 * Part number to Roman numeral display (for Part titles).
 */
const PART_NAMES: Record<number, string> = {
  1: 'Part One',
  2: 'Part Two',
  3: 'Part Three',
  4: 'Part Four',
  5: 'Part Five',
  6: 'Part Six',
  7: 'Part Seven',
  8: 'Part Eight',
  9: 'Part Nine',
  10: 'Part Ten',
};

export function partDisplayName(partNumber: number): string {
  return PART_NAMES[partNumber] ?? `Part ${partNumber}`;
}

/**
 * Get the Tailwind color class for a part number.
 */
export function partColorClass(partNumber: number): string {
  return `part-${partNumber}`;
}

const PART_COLOR_HEX: Record<number, string> = {
  1: '#1e40af',
  2: '#065f46',
  3: '#16a34a',
  4: '#dc2626',
  5: '#7c3aed',
  6: '#ea580c',
  7: '#0891b2',
  8: '#4338ca',
  9: '#be185d',
  10: '#a16207',
};

export function partColorHex(partNumber: number): string {
  return PART_COLOR_HEX[partNumber] ?? '#64748b';
}

export interface PartMeta {
  partNumber: number;
  colorHex: string;
  title: string;
}

export function buildPartsMeta(parts: Array<{ partNumber: number; title: string }>): PartMeta[] {
  return parts.map((p) => ({
    partNumber: p.partNumber,
    colorHex: partColorHex(p.partNumber),
    title: p.title,
  }));
}

/**
 * Create a URL-safe slug from a title.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
