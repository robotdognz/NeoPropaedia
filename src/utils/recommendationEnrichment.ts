import iotCatalog from '../data/iot-catalog.json';
import vsiCatalog from '../content/vsi/catalog.json';
import { vsiLookupKey } from './readingIdentity';

const vsiCatalogLookup = new Map(
  vsiCatalog.titles.map((entry) => [vsiLookupKey(entry.title, entry.author), entry]),
);

const iotCatalogLookup = new Map(
  (iotCatalog as { episodes: Array<{ pid: string; datePublished?: string; durationSeconds?: number }> }).episodes
    .map((episode) => [episode.pid, episode]),
);

export function enrichVsiRecommendationItems<
  T extends { title: string; author?: string; publicationYear?: number; edition?: number },
>(items: T[] | undefined): Array<T & { publicationYear?: number; edition?: number }> | undefined {
  return items?.map((item) => {
    const catalogEntry = item.author
      ? vsiCatalogLookup.get(vsiLookupKey(item.title, item.author))
      : undefined;

    return {
      ...item,
      publicationYear: item.publicationYear ?? catalogEntry?.publicationYear,
      edition: item.edition ?? catalogEntry?.edition,
    };
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
