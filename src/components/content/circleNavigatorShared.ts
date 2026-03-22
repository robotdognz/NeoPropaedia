import type {
  MacropaediaAggregateEntry,
  VsiAggregateEntry,
  WikipediaAggregateEntry,
} from '../../utils/readingData';

export interface CircleNavigatorDivision {
  divisionId: string;
  romanNumeral: string;
  title: string;
}

export interface CircleNavigatorPart {
  partNumber: number;
  partName: string;
  title: string;
  href: string;
  colorHex: string;
  divisions: CircleNavigatorDivision[];
}

export interface SectionConnection {
  sourceSection: string;
  targetSection: string;
  sourcePath: string;
  targetPath: string;
  via?: string;
  sharedArticle?: string;
}

export interface SectionMeta {
  title: string;
  partNumber: number;
  sectionCode: string;
}

export interface BridgeItem {
  t: string;
  a?: string;
  ca: number;
  cb: number;
  r?: number;
}

export interface BridgePair {
  totalVsi: number;
  totalWiki: number;
  totalMacro: number;
  vsi?: BridgeItem[];
  wiki?: BridgeItem[];
  macro?: BridgeItem[];
}

export type CircleNavigatorVsiEntry = Pick<
  VsiAggregateEntry,
  'title' | 'author' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export type CircleNavigatorWikipediaEntry = Pick<
  WikipediaAggregateEntry,
  'title' | 'displayTitle' | 'url' | 'lowestLevel' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export type CircleNavigatorMacropaediaEntry = Pick<
  MacropaediaAggregateEntry,
  'title' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export interface CircleNavigatorPartRecommendations {
  vsi: CircleNavigatorVsiEntry[];
  wiki: CircleNavigatorWikipediaEntry[];
  macro: CircleNavigatorMacropaediaEntry[];
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
  connections: Record<string, SectionConnection[]>;
  sectionMeta: Record<string, SectionMeta>;
  bridgeRecommendations: Record<string, BridgePair>;
  baseUrl: string;
}

export interface ConnectionSummary {
  sections: { section: SectionMeta; refCount: number }[];
  isDirect: boolean;
  hasKeyword: boolean;
  hasConnectionData: boolean;
}

export function getConnectionKey(a: number, b: number): string {
  return Math.min(a, b) + '-' + Math.max(a, b);
}
