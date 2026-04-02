import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import iotCatalog from '../../data/iot-catalog.json';
import wikiCatalog from '../../data/wikipedia-catalog.json';
import type { CircleNavigatorPartRecommendations } from '../../components/content/circleNavigatorShared';
import {
  analyzeProgressSubsectionCoverage,
  buildSectionOutlinePathIndex,
} from '../../utils/outlineCoverage';
import {
  buildIotAggregateEntries,
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
      const iotMappings = await getCollection('iot-mappings');

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
      const sectionOutlinePathIndex = buildSectionOutlinePathIndex(
        sections.map((entry) => entry.data)
      );

      const articleCoverage = new Map<string, {
        sectionCodes: Set<string>;
        progressSubsectionKeys: Set<string>;
      }>();
      for (const mapping of wikiMappings) {
        for (const article of mapping.data.mappings) {
          if (!articleCoverage.has(article.articleTitle)) {
            articleCoverage.set(article.articleTitle, {
              sectionCodes: new Set(),
              progressSubsectionKeys: new Set(),
            });
          }
          const coverage = articleCoverage.get(article.articleTitle)!;
          coverage.sectionCodes.add(mapping.data.sectionCode);
          const progressCoverage = analyzeProgressSubsectionCoverage(
            mapping.data.sectionCode,
            article.relevantPathsAI,
            sectionOutlinePathIndex
          );
          progressCoverage.coverageKeys.forEach((key) => coverage.progressSubsectionKeys.add(key));
        }
      }

      const wikiArticles = (wikiCatalog as any).articles.map((article: any) => ({
        ...article,
        sectionCodes: [...(articleCoverage.get(article.title)?.sectionCodes || [])],
        progressSubsectionKeys: [...(articleCoverage.get(article.title)?.progressSubsectionKeys || [])],
      }));

      const iotCatalogLookup = new Map((iotCatalog as any).episodes.map((episode: any) => [episode.pid, episode]));
      const episodeCoverage = new Map<string, {
        sectionCodes: Set<string>;
        progressSubsectionKeys: Set<string>;
      }>();
      const episodeTitleLookup = new Map<string, string>();

      for (const mapping of iotMappings) {
        for (const episode of mapping.data.mappings) {
          if (!episodeCoverage.has(episode.pid)) {
            episodeCoverage.set(episode.pid, {
              sectionCodes: new Set(),
              progressSubsectionKeys: new Set(),
            });
          }
          const coverage = episodeCoverage.get(episode.pid)!;
          coverage.sectionCodes.add(mapping.data.sectionCode);
          const progressCoverage = analyzeProgressSubsectionCoverage(
            mapping.data.sectionCode,
            episode.relevantPathsAI,
            sectionOutlinePathIndex
          );
          progressCoverage.coverageKeys.forEach((key) => coverage.progressSubsectionKeys.add(key));
          if (!episodeTitleLookup.has(episode.pid)) {
            episodeTitleLookup.set(episode.pid, episode.episodeTitle);
          }
        }
      }

      const iotEpisodes = Array.from(episodeCoverage.entries()).map(([pid, coverage]) => {
        const catalogEntry = iotCatalogLookup.get(pid);

        return {
          pid,
          title: catalogEntry?.title ?? episodeTitleLookup.get(pid) ?? pid,
          url: catalogEntry?.url ?? `https://www.bbc.co.uk/programmes/${pid}`,
          synopsis: catalogEntry?.synopsis,
          summaryAI: catalogEntry?.summaryAI,
          datePublished: catalogEntry?.datePublished,
          durationSeconds: catalogEntry?.durationSeconds,
          sectionCodes: [...coverage.sectionCodes],
          progressSubsectionKeys: [...coverage.progressSubsectionKeys],
        };
      });

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
        progressSubsectionKeys: entry.progressSubsectionKeys,
      }));

      const wikiEntries = buildWikipediaAggregateEntries(wikiArticles, sectionLookup).map((entry) => ({
        title: entry.title,
        displayTitle: entry.displayTitle,
        url: entry.url,
        lowestLevel: entry.lowestLevel,
        wordCount: entry.wordCount,
        checklistKey: entry.checklistKey,
        sectionCount: entry.sectionCount,
        sections: entry.sections,
        progressSubsectionKeys: entry.progressSubsectionKeys,
      }));

      const iotEntries = buildIotAggregateEntries(iotEpisodes, sectionLookup).map((entry) => ({
        pid: entry.pid,
        title: entry.title,
        url: entry.url,
        datePublished: entry.datePublished,
        durationSeconds: entry.durationSeconds,
        checklistKey: entry.checklistKey,
        sectionCount: entry.sectionCount,
        sections: entry.sections,
        progressSubsectionKeys: entry.progressSubsectionKeys,
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
            iot: iotEntries.filter((entry) => entry.sections.some(belongsToPart)),
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
