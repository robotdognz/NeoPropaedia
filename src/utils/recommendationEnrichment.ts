import iotCatalog from '../data/iot-catalog.json';
import { vsiCatalogEntryForTitleAuthor } from './vsiCatalog';

const iotCatalogLookup = new Map(
  (iotCatalog as { episodes: Array<{ pid: string; datePublished?: string; durationSeconds?: number }> }).episodes
    .map((episode) => [episode.pid, episode]),
);

export function enrichVsiRecommendationItems<
  T extends { title: string; author?: string; publicationYear?: number; edition?: number; pageCount?: number; wordCount?: number },
>(items: T[] | undefined): Array<T & { publicationYear?: number; edition?: number; pageCount?: number; wordCount?: number }> | undefined {
  return items?.flatMap((item) => {
    const catalogEntry = vsiCatalogEntryForTitleAuthor(item.title, item.author);
    if (!catalogEntry && item.author) {
      return [];
    }

    return [{
      ...item,
      title: catalogEntry?.title ?? item.title,
      author: catalogEntry?.author ?? item.author,
      publicationYear: item.publicationYear ?? catalogEntry?.publicationYear,
      edition: item.edition ?? catalogEntry?.edition,
      pageCount: item.pageCount ?? catalogEntry?.pageCount,
      wordCount: item.wordCount ?? catalogEntry?.wordCount,
    }];
  });
}

export function enrichIotRecommendationItems<
  T extends { pid?: string; datePublished?: string; durationSeconds?: number },
>(items: T[] | undefined): Array<T & { datePublished?: string; durationSeconds?: number }> | undefined {
  return items?.map((item) => {
    const catalogEntry = item.pid ? iotCatalogLookup.get(item.pid) : undefined;

    return {
      ...item,
      datePublished: item.datePublished ?? catalogEntry?.datePublished,
      durationSeconds: item.durationSeconds ?? catalogEntry?.durationSeconds,
    };
  });
}
