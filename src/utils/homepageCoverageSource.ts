import { slugify } from './helpers';
import type { HomepageCoverageSource } from './homepageCoverageTypes';
import { formatIotEpisodeMeta } from './iotMetadata';
import type {
  IotLibraryPayload,
  MacropaediaLibraryPayload,
  VsiLibraryPayload,
  WikipediaLibraryPayload,
} from './readingLibraryPayloads';
import type { ReadingType } from './readingPreference';

type HomepageCoverageLibraryPayloadMap = {
  vsi: VsiLibraryPayload;
  wikipedia: WikipediaLibraryPayload;
  iot: IotLibraryPayload;
  macropaedia: MacropaediaLibraryPayload;
};

const HOMEPAGE_COVERAGE_META: Record<
  ReadingType,
  Pick<HomepageCoverageSource, 'includeSubsections' | 'itemSingular' | 'itemPlural'>
> = {
  vsi: {
    includeSubsections: true,
    itemSingular: 'book',
    itemPlural: 'books',
  },
  wikipedia: {
    includeSubsections: true,
    itemSingular: 'article',
    itemPlural: 'articles',
  },
  iot: {
    includeSubsections: true,
    itemSingular: 'episode',
    itemPlural: 'episodes',
  },
  macropaedia: {
    includeSubsections: false,
    itemSingular: 'article',
    itemPlural: 'articles',
  },
};

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function buildHomepageCoverageSourceFromLibraryPayload<T extends ReadingType>(
  type: T,
  payload: HomepageCoverageLibraryPayloadMap[T],
  baseUrl: string,
): HomepageCoverageSource {
  const meta = HOMEPAGE_COVERAGE_META[type];

  switch (type) {
    case 'vsi':
      return {
        type,
        ...meta,
        entries: payload.entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.title,
          href: joinBaseUrl(baseUrl, `vsi/${slugify(entry.title)}`),
          author: entry.author,
          number: entry.number,
          publicationYear: entry.publicationYear,
          edition: entry.edition,
          pageCount: entry.pageCount,
          wordCount: entry.wordCount,
          sectionCount: entry.sectionCount,
          sections: entry.sections,
          progressSubsectionKeys: entry.progressSubsectionKeys,
        })),
      };

    case 'wikipedia':
      return {
        type,
        ...meta,
        entries: payload.entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.displayTitle ?? entry.title,
          href: joinBaseUrl(baseUrl, `wikipedia/${slugify(entry.title)}`),
          category: entry.category,
          wordCount: entry.wordCount,
          lowestLevel: entry.lowestLevel,
          sectionCount: entry.sectionCount,
          sections: entry.sections,
          progressSubsectionKeys: entry.progressSubsectionKeys,
        })),
      };

    case 'iot':
      return {
        type,
        ...meta,
        entries: payload.entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.title,
          href: joinBaseUrl(baseUrl, `iot/${entry.pid}`),
          meta: formatIotEpisodeMeta(entry) || undefined,
          datePublished: entry.datePublished,
          durationSeconds: entry.durationSeconds,
          sectionCount: entry.sectionCount,
          sections: entry.sections,
          progressSubsectionKeys: entry.progressSubsectionKeys,
        })),
      };

    case 'macropaedia':
      return {
        type,
        ...meta,
        entries: payload.entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.title,
          href: joinBaseUrl(baseUrl, `macropaedia/${slugify(entry.title)}`),
          sectionCount: entry.sectionCount,
          sections: entry.sections,
        })),
      };
  }
}

export async function fetchHomepageCoverageSource(
  type: ReadingType,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<HomepageCoverageSource> {
  const response = await fetch(joinBaseUrl(baseUrl, `library-data/${type}.json`), {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Unable to load coverage source for ${type}.`);
  }

  const payload = await response.json() as HomepageCoverageLibraryPayloadMap[typeof type];
  return buildHomepageCoverageSourceFromLibraryPayload(type, payload, baseUrl);
}
