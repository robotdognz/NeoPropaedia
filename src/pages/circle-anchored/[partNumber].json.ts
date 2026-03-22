import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import wikiCatalog from '../../data/wikipedia-catalog.json';
import type { CircleNavigatorPartRecommendations } from '../../components/content/circleNavigatorShared';
import {
  buildMacropaediaAggregateEntries,
  buildVsiAggregateEntries,
  buildWikipediaAggregateEntries,
  type ReadingSectionSummary,
} from '../../utils/readingData';

const PART_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);

let anchoredReadingMapPromise: Promise<Map<number, CircleNavigatorPartRecommendations>> | undefined;

async function loadAnchoredReadingMap(): Promise<Map<number, CircleNavigatorPartRecommendations>> {
  if (!anchoredReadingMapPromise) {
    anchoredReadingMapPromise = (async () => {
      const sections = await getCollection('sections');
      const vsiMappings = await getCollection('vsi-mappings');
      const vsiCatalogCollections = await getCollection('vsi');
      const wikiMappings = await getCollection('wiki-mappings');

      const sectionSummaries = sections.map((entry) => ({
        sectionCode: entry.data.sectionCode,
        sectionCodeDisplay: entry.data.sectionCodeDisplay,
        title: entry.data.title,
        partNumber: entry.data.partNumber,
        divisionId: entry.data.divisionId,
      }));

      const sectionLookup = new Map<string, ReadingSectionSummary>(
        sectionSummaries.map((section) => [section.sectionCode, section])
      );

      const articleSectionCodes = new Map<string, Set<string>>();
      for (const mapping of wikiMappings) {
        for (const article of mapping.data.mappings) {
          if (!articleSectionCodes.has(article.articleTitle)) {
            articleSectionCodes.set(article.articleTitle, new Set());
          }
          articleSectionCodes.get(article.articleTitle)!.add(mapping.data.sectionCode);
        }
      }

      const wikiArticles = (wikiCatalog as any).articles.map((article: any) => ({
        ...article,
        sectionCodes: [...(articleSectionCodes.get(article.title) || [])],
      }));

      const vsiEntries = buildVsiAggregateEntries(
        sectionSummaries,
        vsiMappings.map((entry) => entry.data),
        vsiCatalogCollections.flatMap((entry) => entry.data.titles)
      ).map((entry) => ({
        title: entry.title,
        author: entry.author,
        checklistKey: entry.checklistKey,
        sectionCount: entry.sectionCount,
        sections: entry.sections,
      }));

      const wikiEntries = buildWikipediaAggregateEntries(wikiArticles, sectionLookup).map((entry) => ({
        title: entry.title,
        displayTitle: entry.displayTitle,
        url: entry.url,
        lowestLevel: entry.lowestLevel,
        checklistKey: entry.checklistKey,
        sectionCount: entry.sectionCount,
        sections: entry.sections,
      }));

      const macroEntries = buildMacropaediaAggregateEntries(sections.map((entry) => entry.data)).map((entry) => ({
        title: entry.title,
        checklistKey: entry.checklistKey,
        sectionCount: entry.sectionCount,
        sections: entry.sections,
      }));

      return new Map(
        PART_NUMBERS.map((partNumber) => {
          const belongsToPart = (section: ReadingSectionSummary) => section.partNumber === partNumber;

          return [partNumber, {
            vsi: vsiEntries.filter((entry) => entry.sections.some(belongsToPart)),
            wiki: wikiEntries.filter((entry) => entry.sections.some(belongsToPart)),
            macro: macroEntries.filter((entry) => entry.sections.some(belongsToPart)),
          }];
        })
      );
    })();
  }

  return anchoredReadingMapPromise;
}

export function getStaticPaths() {
  return PART_NUMBERS.map((partNumber) => ({
    params: { partNumber: String(partNumber) },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const partNumber = Number(params.partNumber);
  if (!Number.isInteger(partNumber) || !PART_NUMBERS.includes(partNumber)) {
    return new Response('Not found', { status: 404 });
  }

  const anchoredReadingMap = await loadAnchoredReadingMap();
  const recommendations = anchoredReadingMap.get(partNumber);

  if (!recommendations) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(JSON.stringify(recommendations), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
