import type { ReadingSectionSummary } from './readingData';
import type { ReadingType } from './readingPreference';

export interface HomepageCoverageEntry {
  checklistKey: string;
  title: string;
  href: string;
  meta?: string;
  lowestLevel?: number;
  sectionCount: number;
  sections: ReadingSectionSummary[];
  progressSubsectionKeys?: string[];
}

export interface HomepageCoverageSource {
  type: ReadingType;
  itemSingular: string;
  itemPlural: string;
  includeSubsections: boolean;
  entries: HomepageCoverageEntry[];
}
