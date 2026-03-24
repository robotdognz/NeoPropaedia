import type { ReadingSectionSummary } from './readingData';
import type { CoverageLayer } from './readingLibrary';
import type { ReadingType } from './readingPreference';

export interface HomepageCoverageEntry {
  checklistKey: string;
  title: string;
  href: string;
  meta?: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
  subsectionKeys?: string[];
}

export interface HomepageCoverageSource {
  type: ReadingType;
  label: string;
  browseHref: string;
  browseLabel: string;
  totalLabel: string;
  totalDescription: string;
  completedDescription: string;
  itemSingular: string;
  itemPlural: string;
  includeSubsections: boolean;
  outlineItemCounts?: Record<string, number>;
  totalOutlineItems?: number;
  activeCoverageDescriptions: Partial<Record<CoverageLayer, string>>;
  entries: HomepageCoverageEntry[];
}
