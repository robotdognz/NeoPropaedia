import { divisionUrl, partUrl, sectionUrl } from './helpers';
import type { OutlinePartNode } from './outlineGraph';

export interface SidebarNavSection {
  sectionCode: string;
  sectionCodeDisplay: string;
  title: string;
  href: string;
}

export interface SidebarNavDivision {
  divisionId: string;
  romanNumeral: string;
  title: string;
  href: string;
  sections: SidebarNavSection[];
}

export interface SidebarNavPart {
  partNumber: number;
  title: string;
  href: string;
  divisions: SidebarNavDivision[];
}

export interface SidebarNavigationPayload {
  parts: SidebarNavPart[];
}

export function buildSidebarNavigation(
  parts: OutlinePartNode[],
  baseUrl: string,
): SidebarNavigationPayload {
  return {
    parts: parts.map((part) => ({
      partNumber: part.partNumber,
      title: part.title,
      href: partUrl(part.partNumber, baseUrl),
      divisions: part.divisions.map((division) => ({
        divisionId: division.divisionId,
        romanNumeral: division.romanNumeral,
        title: division.title,
        href: divisionUrl(division.divisionId, baseUrl),
        sections: division.sections.map((section) => ({
          sectionCode: section.sectionCode,
          sectionCodeDisplay: section.sectionCodeDisplay,
          title: section.title,
          href: sectionUrl(section.sectionCode, baseUrl),
        })),
      })),
    })),
  };
}
