import { Fragment } from 'preact';
import {
  divisionUrl,
  normalizeOutlinePath,
  partUrl,
  sectionReferenceUrl,
} from '../../utils/helpers';

export interface InlineReferenceTextProps {
  text: string;
  baseUrl: string;
  className?: string;
  currentHref?: string;
  sectionCode?: string;
}

const PART_WORD_TO_NUMBER: Record<string, number> = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
  Ten: 10,
};

const ROMAN_TO_NUMBER: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

// Valid section codes from the Propaedia, used to validate matched codes.
const VALID_SECTION_CODES = new Set([
  '111','112','121','122','123','124','125','126','127','128','131','132','133',
  '211','212','213','214','221','222','223','231','232','241','242','243',
  '311','312','313','321','322','323','331','332','333','334','335','336','337','338','339','341','342','351','352','353','354','355',
  '411','412','421','422','423','424','431','432','433','434','435','436',
  '511','512','513','514','521','522','523','524','531','532','533','534','535','536','541','542','543','544','551','552','553','561','562',
  '611','612','613','621','622','623','624','625','626','627','628','629',
  '711','712','721','722','723','724','725','731','732','733','734','735','736','737','738',
  '811','812','821','822','823','824','825','826','827','828','829',
  '911','912','921','922','923','924','931','932','933','934','935','936','937','941','942','943','944','945','951','952',
  '961','962','963','964','965','966','967','968','969','971','972','973','974','975','976','977','978',
  '96/10','96/11',
  '10/11','10/12','10/21','10/22','10/23','10/31','10/32','10/33','10/34','10/35','10/36','10/37',
  '10/41','10/42','10/51','10/52','10/53','10/61',
]);

const SECTION_PATH_SEGMENT = String.raw`(?:\d{1,3}|[IVXLCDM]{2,}|[ivxlcdm]{2,}|[A-Z](?![a-z])|[a-z](?![a-z]))`;
const SECTION_CODE_PATTERN = String.raw`(?<!\d)(?:\d(?:\s*\d){2}|\d(?:\s*\d){1,2}\s*\/\s*\d(?:\s*\d)?)(?!\s*\d)`;

// Pattern for Part/Division references (these are safe to match anywhere in text)
const PART_DIV_PATTERN = new RegExp(
  String.raw`Division\s+(?<divisionOfPartRoman>[IVX]+)\s+of\s+Part\s+(?<divisionOfPartWord>One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)|Part\s+(?<partDivisionWord>One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten),\s*Division\s+(?<partDivisionRoman>[IVX]+)|Part\s+(?<singlePartWord>One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)`,
  'g'
);

// Pattern for section code references inside brackets containing "see".
// Matches [see ...], [see also ...], [for ..., see ...], and parenthesized variants.
const BRACKET_REF_PATTERN = new RegExp(
  String.raw`\[[^\]]*?\bsee\s+(?:also\s+)?(?<bracketContent>[^\]]+)\]|\([^\)]*?\bsee\s+(?:also\s+)?(?<parenContent>[^\)]+)\)`,
  'gi'
);

// Pattern to find individual section references within a bracket's content
const INNER_REF_PATTERN = new RegExp(
  String.raw`(?<sectionCode>${SECTION_CODE_PATTERN})(?<sectionPath>\s*\.\s*${SECTION_PATH_SEGMENT}(?:\.${SECTION_PATH_SEGMENT})*\.?)?`,
  'g'
);

// Pattern for intra-section path-only references like "C.", "B.1.a.", "E.1.c.", "5."
// Matches paths starting with a capital letter or a numeric level
const INTRA_SECTION_PATH_PATTERN = new RegExp(
  String.raw`(?<intraPath>(?:[A-Z]|\d+)(?:\.${SECTION_PATH_SEGMENT})*\.?)`,
  'g'
);

function divisionId(partNumber: number, divisionNumber: number) {
  return `${partNumber}-${String(divisionNumber).padStart(2, '0')}`;
}

function partDivHref(groups: Record<string, string | undefined>, baseUrl: string): string | null {
  if (groups.divisionOfPartRoman && groups.divisionOfPartWord) {
    const partNumber = PART_WORD_TO_NUMBER[groups.divisionOfPartWord];
    const divisionNumber = ROMAN_TO_NUMBER[groups.divisionOfPartRoman];
    if (partNumber && divisionNumber) {
      return divisionUrl(divisionId(partNumber, divisionNumber), baseUrl);
    }
  }
  if (groups.partDivisionWord && groups.partDivisionRoman) {
    const partNumber = PART_WORD_TO_NUMBER[groups.partDivisionWord];
    const divisionNumber = ROMAN_TO_NUMBER[groups.partDivisionRoman];
    if (partNumber && divisionNumber) {
      return divisionUrl(divisionId(partNumber, divisionNumber), baseUrl);
    }
  }
  if (groups.singlePartWord) {
    const partNumber = PART_WORD_TO_NUMBER[groups.singlePartWord];
    if (partNumber) {
      return partUrl(partNumber, baseUrl);
    }
  }
  return null;
}

interface MatchInfo {
  index: number;
  length: number;
  href: string;
}

function collectMatches(text: string, baseUrl: string, currentHref?: string, sectionCode?: string): MatchInfo[] {
  const matches: MatchInfo[] = [];

  // 1. Find Part/Division references anywhere in text
  for (const match of text.matchAll(PART_DIV_PATTERN)) {
    const href = partDivHref((match.groups ?? {}) as Record<string, string | undefined>, baseUrl);
    if (href && href !== currentHref) {
      matches.push({ index: match.index!, length: match[0].length, href });
    }
  }

  // 2. Find section code references only inside [see ...] or (see ...) brackets
  for (const bracketMatch of text.matchAll(BRACKET_REF_PATTERN)) {
    const content = bracketMatch.groups?.bracketContent ?? bracketMatch.groups?.parenContent ?? '';
    const contentStart = bracketMatch.index! + bracketMatch[0].indexOf(content);
    const hasAboveBelow = /\b(?:above|below)\b/i.test(content);
    let lastSectionCode: string | null = null;

    for (const innerMatch of content.matchAll(INNER_REF_PATTERN)) {
      const code = (innerMatch.groups?.sectionCode ?? '').replace(/\s+/g, '');
      if (!VALID_SECTION_CODES.has(code)) continue;
      lastSectionCode = code;

      const path = innerMatch.groups?.sectionPath
        ? normalizeOutlinePath(innerMatch.groups.sectionPath)
        : '';
      const href = sectionReferenceUrl(code, path, baseUrl);
      if (href === currentHref) continue;

      const absIndex = contentStart + innerMatch.index!;
      matches.push({ index: absIndex, length: innerMatch[0].length, href });
    }

    // 3. Bare path references that inherit the section code from a preceding reference
    // e.g., [see 222.B. and C.] — "C." inherits section code 222
    // Also handles intra-section refs like [see C., below] when sectionCode prop is set
    const implicitCode = lastSectionCode || (hasAboveBelow ? sectionCode : null);
    if (implicitCode) {
      // Match bare paths not already covered by INNER_REF_PATTERN
      for (const pathMatch of content.matchAll(INTRA_SECTION_PATH_PATTERN)) {
        const intraPath = pathMatch.groups?.intraPath ?? '';
        // Must look like a path: "C.", "B.1.a.", "5.", or a single capital letter
        const isLetterPath = /^[A-Z]\./.test(intraPath) || /^[A-Z]$/.test(intraPath);
        const isNumericPath = /^\d+\.?$/.test(intraPath);
        if (!isLetterPath && !isNumericPath) continue;
        // Skip regular words like "Babylonian"
        if (/^[A-Z][a-z]/.test(intraPath)) continue;
        // For bare numbers, only match in intra-section context (with above/below)
        if (isNumericPath && !hasAboveBelow) continue;

        const normalizedPath = normalizeOutlinePath(intraPath);
        if (!normalizedPath) continue;

        const absIndex = contentStart + pathMatch.index!;

        // Skip if this position is already covered by a section code match
        const alreadyCovered = matches.some(m => absIndex >= m.index && absIndex < m.index + m.length);
        if (alreadyCovered) continue;

        const href = sectionReferenceUrl(implicitCode, normalizedPath, baseUrl);
        if (href === currentHref) continue;

        // For intra-section refs, extend match to include trailing ", below" or ", above"
        let matchLength = intraPath.length;
        if (implicitCode === sectionCode) {
          const after = content.slice(pathMatch.index! + intraPath.length);
          const trailingMatch = after.match(/^,?\s*(?:above|below)/);
          if (trailingMatch) matchLength += trailingMatch[0].length;
        }

        matches.push({ index: absIndex, length: matchLength, href });
      }
    }
  }

  // Sort by position and remove overlaps
  matches.sort((a, b) => a.index - b.index);
  const filtered: MatchInfo[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.index >= lastEnd) {
      filtered.push(m);
      lastEnd = m.index + m.length;
    }
  }

  return filtered;
}

export default function InlineReferenceText({
  text,
  baseUrl,
  className,
  currentHref,
  sectionCode,
}: InlineReferenceTextProps) {
  const matches = collectMatches(text, baseUrl, currentHref, sectionCode);

  if (matches.length === 0) {
    return <span class={className}>{text}</span>;
  }

  const fragments: Array<string | JSX.Element> = [];
  let lastIndex = 0;

  for (const match of matches) {
    if (match.index > lastIndex) {
      fragments.push(text.slice(lastIndex, match.index));
    }

    const label = text.slice(match.index, match.index + match.length);
    fragments.push(
      <a
        href={match.href}
        class="text-indigo-700 underline-offset-2 transition-colors hover:text-indigo-900 hover:underline focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded-sm"
        onClick={(event) => event.stopPropagation()}
      >
        {label}
      </a>
    );

    lastIndex = match.index + match.length;
  }

  if (lastIndex < text.length) {
    fragments.push(text.slice(lastIndex));
  }

  return (
    <span class={className}>
      {fragments.map((fragment, index) => (
        <Fragment key={index}>{fragment}</Fragment>
      ))}
    </span>
  );
}
