import { getCollection } from 'astro:content';

export interface OutlineSectionNode {
  sectionCode: string;
  sectionCodeDisplay: string;
  title: string;
  partNumber: number;
  divisionId: string;
}

export interface OutlineDivisionNode {
  divisionId: string;
  partNumber: number;
  romanNumeral: string;
  title: string;
  headnote: string[];
  sections: OutlineSectionNode[];
}

export interface OutlinePartNode {
  partNumber: number;
  title: string;
  subtitle?: string;
  color: string;
  headnote: string[];
  divisions: OutlineDivisionNode[];
}

export interface OutlineSectionMeta {
  partNumber: number;
  partTitle: string;
  divisionId: string;
  divisionTitle: string;
  sectionTitle: string;
  sectionCodeDisplay: string;
}

export interface OutlineGraph {
  parts: OutlinePartNode[];
  flatDivisions: OutlineDivisionNode[];
  flatSections: OutlineSectionNode[];
  partByNumber: Map<number, OutlinePartNode>;
  divisionById: Map<string, OutlineDivisionNode>;
  sectionByCode: Map<string, OutlineSectionNode>;
  sectionIndexByCode: Map<string, number>;
  sectionMeta: Record<string, OutlineSectionMeta>;
  totals: {
    parts: number;
    divisions: number;
    sections: number;
  };
}

let outlineGraphPromise: Promise<OutlineGraph> | undefined;

function missingReferenceError(kind: string, parent: string, child: string): Error {
  return new Error(`Outline graph is invalid: ${kind} "${child}" referenced by "${parent}" was not found.`);
}

export function loadOutlineGraph(): Promise<OutlineGraph> {
  if (!outlineGraphPromise) {
    outlineGraphPromise = buildOutlineGraph();
  }

  return outlineGraphPromise;
}

async function buildOutlineGraph(): Promise<OutlineGraph> {
  const [partEntries, divisionEntries, sectionEntries] = await Promise.all([
    getCollection('parts'),
    getCollection('divisions'),
    getCollection('sections'),
  ]);

  const divisionSourceById = new Map(divisionEntries.map((entry) => [entry.data.divisionId, entry.data]));
  const sectionSourceByCode = new Map(sectionEntries.map((entry) => [entry.data.sectionCode, entry.data]));

  const parts = [...partEntries]
    .sort((left, right) => left.data.partNumber - right.data.partNumber)
    .map((partEntry) => {
      const divisions = partEntry.data.divisions.map((divisionId) => {
        const division = divisionSourceById.get(divisionId);
        if (!division) throw missingReferenceError('Division', `Part ${partEntry.data.partNumber}`, divisionId);
        if (division.partNumber !== partEntry.data.partNumber) {
          throw new Error(
            `Outline graph is invalid: Division "${divisionId}" belongs to Part ${division.partNumber}, not Part ${partEntry.data.partNumber}.`
          );
        }

        const sections = division.sections.map((sectionCode) => {
          const section = sectionSourceByCode.get(sectionCode);
          if (!section) throw missingReferenceError('Section', `Division ${division.divisionId}`, sectionCode);
          if (section.divisionId !== division.divisionId) {
            throw new Error(
              `Outline graph is invalid: Section "${sectionCode}" belongs to Division ${section.divisionId}, not ${division.divisionId}.`
            );
          }
          if (section.partNumber !== partEntry.data.partNumber) {
            throw new Error(
              `Outline graph is invalid: Section "${sectionCode}" belongs to Part ${section.partNumber}, not Part ${partEntry.data.partNumber}.`
            );
          }

          return {
            sectionCode: section.sectionCode,
            sectionCodeDisplay: section.sectionCodeDisplay,
            title: section.title,
            partNumber: section.partNumber,
            divisionId: section.divisionId,
          };
        });

        return {
          divisionId: division.divisionId,
          partNumber: division.partNumber,
          romanNumeral: division.romanNumeral,
          title: division.title,
          headnote: division.headnote ?? [],
          sections,
        };
      });

      return {
        partNumber: partEntry.data.partNumber,
        title: partEntry.data.title,
        subtitle: partEntry.data.subtitle,
        color: partEntry.data.color,
        headnote: partEntry.data.headnote ?? [],
        divisions,
      };
    });

  const flatDivisions = parts.flatMap((part) => part.divisions);
  const flatSections = flatDivisions.flatMap((division) => division.sections);
  const partByNumber = new Map(parts.map((part) => [part.partNumber, part]));
  const divisionById = new Map(flatDivisions.map((division) => [division.divisionId, division]));
  const sectionByCode = new Map(flatSections.map((section) => [section.sectionCode, section]));
  const sectionIndexByCode = new Map(flatSections.map((section, index) => [section.sectionCode, index]));

  const sectionMeta = Object.fromEntries(
    flatSections.map((section) => {
      const part = partByNumber.get(section.partNumber);
      const division = divisionById.get(section.divisionId);

      if (!part || !division) {
        throw new Error(`Outline graph is invalid: could not resolve metadata for section "${section.sectionCode}".`);
      }

      return [
        section.sectionCode,
        {
          partNumber: section.partNumber,
          partTitle: part.title,
          divisionId: section.divisionId,
          divisionTitle: division.title,
          sectionTitle: section.title,
          sectionCodeDisplay: section.sectionCodeDisplay,
        },
      ];
    })
  );

  return {
    parts,
    flatDivisions,
    flatSections,
    partByNumber,
    divisionById,
    sectionByCode,
    sectionIndexByCode,
    sectionMeta,
    totals: {
      parts: parts.length,
      divisions: flatDivisions.length,
      sections: flatSections.length,
    },
  };
}
