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

export interface PartReadingItem {
  title: string;
  author?: string;
  count: number;
}

export interface PartReadings {
  vsi?: PartReadingItem[];
  wiki?: PartReadingItem[];
  macro?: PartReadingItem[];
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
  connections: Record<string, SectionConnection[]>;
  sectionMeta: Record<string, SectionMeta>;
  bridgeRecommendations: Record<string, BridgePair>;
  partReadings: Record<string, PartReadings>;
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
