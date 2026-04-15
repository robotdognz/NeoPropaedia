import { getCollection } from 'astro:content';
import type { OutlinePartNode } from './outlineGraph';
import { normalizeOutlinePath } from './helpers';
import { loadOutlineGraph } from './outlineGraph';

interface SectionOutlineSource {
  sectionCode: string;
  outline?: Array<{
    level?: string;
  }>;
}

export interface OutlineProgressTargets {
  ownLayer: 'part' | 'division' | 'section';
  ownKey: string;
  divisionIds: string[];
  sectionCodes: string[];
  subsectionKeys: string[];
}

export interface OutlineProgressTargetLookups {
  partTargets: Map<number, OutlineProgressTargets>;
  divisionTargets: Map<string, OutlineProgressTargets>;
  sectionTargets: Map<string, OutlineProgressTargets>;
  subsectionKeysBySection: Map<string, string[]>;
}

let outlineProgressTargetLookupsPromise: Promise<OutlineProgressTargetLookups> | undefined;

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function subsectionKeysForSection(sectionCode: string, outline: SectionOutlineSource['outline']): string[] {
  const topLevelKeys = (outline ?? [])
    .map((node) => normalizeOutlinePath(node?.level ?? ''))
    .filter(Boolean)
    .map((path) => `${sectionCode}::${path}`);

  return uniqueValues(topLevelKeys);
}

export function buildOutlineProgressTargetLookups(
  parts: OutlinePartNode[],
  sectionOutlines: SectionOutlineSource[],
): OutlineProgressTargetLookups {
  const subsectionKeysBySection = new Map(
    sectionOutlines.map((section) => [
      section.sectionCode,
      subsectionKeysForSection(section.sectionCode, section.outline),
    ]),
  );

  const partTargets = new Map<number, OutlineProgressTargets>();
  const divisionTargets = new Map<string, OutlineProgressTargets>();
  const sectionTargets = new Map<string, OutlineProgressTargets>();

  for (const part of parts) {
    const divisionIds = part.divisions.map((division) => division.divisionId);
    const sectionCodes = part.divisions.flatMap((division) =>
      division.sections.map((section) => section.sectionCode),
    );
    const subsectionKeys = uniqueValues(
      sectionCodes.flatMap((sectionCode) => subsectionKeysBySection.get(sectionCode) ?? []),
    );

    partTargets.set(part.partNumber, {
      ownLayer: 'part',
      ownKey: String(part.partNumber),
      divisionIds,
      sectionCodes,
      subsectionKeys,
    });

    for (const division of part.divisions) {
      const divisionSectionCodes = division.sections.map((section) => section.sectionCode);
      const divisionSubsectionKeys = uniqueValues(
        divisionSectionCodes.flatMap((sectionCode) => subsectionKeysBySection.get(sectionCode) ?? []),
      );

      divisionTargets.set(division.divisionId, {
        ownLayer: 'division',
        ownKey: division.divisionId,
        divisionIds: [division.divisionId],
        sectionCodes: divisionSectionCodes,
        subsectionKeys: divisionSubsectionKeys,
      });

      for (const section of division.sections) {
        sectionTargets.set(section.sectionCode, {
          ownLayer: 'section',
          ownKey: section.sectionCode,
          divisionIds: [],
          sectionCodes: [section.sectionCode],
          subsectionKeys: subsectionKeysBySection.get(section.sectionCode) ?? [],
        });
      }
    }
  }

  return {
    partTargets,
    divisionTargets,
    sectionTargets,
    subsectionKeysBySection,
  };
}

export function loadOutlineProgressTargetLookups(): Promise<OutlineProgressTargetLookups> {
  if (!outlineProgressTargetLookupsPromise) {
    outlineProgressTargetLookupsPromise = Promise.all([
      loadOutlineGraph(),
      getCollection('sections'),
    ]).then(([outline, sections]) =>
      buildOutlineProgressTargetLookups(
        outline.parts,
        sections.map((entry) => ({
          sectionCode: entry.data.sectionCode,
          outline: entry.data.outline,
        })),
      ),
    );
  }

  return outlineProgressTargetLookupsPromise;
}
