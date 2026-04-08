import type { ReadingSectionSummary } from './readingData';
import type { ReadingType } from './readingPreference';

export interface HomepageCoverageEntry {
  checklistKey: string;
  title: string;
  href: string;
  meta?: string;
  author?: string;
  number?: number;
  publicationYear?: number;
  edition?: number;
  pageCount?: number;
  wordCount?: number;
  datePublished?: string;
  durationSeconds?: number;
  category?: string;
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
