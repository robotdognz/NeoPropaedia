import { getCollection } from 'astro:content';
import iotCatalog from '../data/iot-catalog.json';
import wikipediaCatalog from '../data/wikipedia-catalog.json';
import type { PartMeta } from './helpers';
import { buildPartsMeta } from './helpers';
import { loadOutlineGraph } from './outlineGraph';
import {
  analyzeMappedOutlinePathCoverage,
  analyzeProgressSubsectionCoverage,
  buildSectionOutlinePathIndex,
} from './outlineCoverage';
import {
  buildIotAggregateEntries,
  buildMacropaediaAggregateEntries,
  buildVsiAggregateEntries,
  buildWikipediaAggregateEntries,
  type IotAggregateEntry,
  type MacropaediaAggregateEntry,
  type ReadingSectionSummary,
  type VsiAggregateEntry,
  type WikipediaAggregateEntry,
} from './readingData';

export type RemoteLibraryType = 'vsi' | 'wikipedia' | 'iot' | 'macropaedia';

export interface VsiLibraryPayload {
  entries: VsiAggregateEntry[];
  partsMeta: PartMeta[];
}

export interface WikipediaLibraryPayload {
  entries: WikipediaAggregateEntry[];
  partsMeta: PartMeta[];
}

export interface IotLibraryPayload {
  entries: IotAggregateEntry[];
  partsMeta: PartMeta[];
}

export interface MacropaediaLibraryPayload {
  entries: MacropaediaAggregateEntry[];
  partsMeta: PartMeta[];
}

interface LibraryPayloadMap {
  vsi: VsiLibraryPayload;
  wikipedia: WikipediaLibraryPayload;
  iot: IotLibraryPayload;
  macropaedia: MacropaediaLibraryPayload;
}

interface SectionWithMeta {
  sectionCode: string;
  sectionCodeDisplay: string;
  title: string;
  partNumber: number;
  partTitle?: string;
  divisionId: string;
  divisionTitle?: string;
  outline: any[];
  macropaediaReferences: string[];
}

interface SharedLibraryContext {
  partsMeta: PartMeta[];
  sectionsWithMeta: SectionWithMeta[];
  sectionLookup: Map<string, ReadingSectionSummary>;
  sectionOutlinePathIndex: ReturnType<typeof buildSectionOutlinePathIndex>;
}

let sharedLibraryContextPromise: Promise<SharedLibraryContext> | undefined;
const payloadPromises: Partial<{ [K in RemoteLibraryType]: Promise<LibraryPayloadMap[K]> }> = {};

async function loadSharedLibraryContext(): Promise<SharedLibraryContext> {
  if (!sharedLibraryContextPromise) {
    sharedLibraryContextPromise = (async () => {
      const [sections, outline] = await Promise.all([
        getCollection('sections'),
        loadOutlineGraph(),
      ]);

      const sectionsWithMeta = sections.map((entry) => {
        const meta = outline.sectionMeta[entry.data.sectionCode];
        return {
          ...entry.data,
          partTitle: meta?.partTitle,
          divisionTitle: meta?.divisionTitle,
        };
      });

      const sectionLookup = new Map<string, ReadingSectionSummary>(
        sectionsWithMeta.map((section) => [
          section.sectionCode,
          {
            sectionCode: section.sectionCode,
            sectionCodeDisplay: section.sectionCodeDisplay,
            title: section.title,
            partNumber: section.partNumber,
            partTitle: section.partTitle,
            divisionId: section.divisionId,
            divisionTitle: section.divisionTitle,
          },
        ]),
      );

      return {
        partsMeta: buildPartsMeta(outline.parts),
        sectionsWithMeta,
        sectionLookup,
        sectionOutlinePathIndex: buildSectionOutlinePathIndex(
          sections.map((entry) => entry.data),
        ),
      };
    })();
  }

  return sharedLibraryContextPromise;
}

async function buildVsiLibraryPayload(): Promise<VsiLibraryPayload> {
  const [context, mappings, catalogCollections] = await Promise.all([
    loadSharedLibraryContext(),
    getCollection('vsi-mappings'),
    getCollection('vsi'),
  ]);

  return {
    entries: buildVsiAggregateEntries(
      context.sectionsWithMeta,
      mappings.map((entry) => entry.data),
      catalogCollections.flatMap((entry) => entry.data.titles),
    ),
    partsMeta: context.partsMeta,
  };
}

async function buildWikipediaLibraryPayload(): Promise<WikipediaLibraryPayload> {
  const [context, wikiMappings] = await Promise.all([
    loadSharedLibraryContext(),
    getCollection('wiki-mappings'),
  ]);

  const articleCoverage = new Map<string, {
    sectionCodes: Set<string>;
    progressSubsectionKeys: Set<string>;
    mappedPathCount: number;
    mappedPathSections: Set<string>;
    fallbackSections: Set<string>;
  }>();

  for (const mapping of wikiMappings) {
    for (const article of mapping.data.mappings) {
      if (!articleCoverage.has(article.articleTitle)) {
        articleCoverage.set(article.articleTitle, {
          sectionCodes: new Set(),
          progressSubsectionKeys: new Set(),
          mappedPathCount: 0,
          mappedPathSections: new Set(),
          fallbackSections: new Set(),
        });
      }

      const coverage = articleCoverage.get(article.articleTitle)!;
      coverage.sectionCodes.add(mapping.data.sectionCode);
      const mappedPathCoverage = analyzeMappedOutlinePathCoverage(
        mapping.data.sectionCode,
        article.relevantPathsAI,
        context.sectionOutlinePathIndex,
      );
      const progressCoverage = analyzeProgressSubsectionCoverage(
        mapping.data.sectionCode,
        article.relevantPathsAI,
        context.sectionOutlinePathIndex,
      );

      progressCoverage.coverageKeys.forEach((key) => coverage.progressSubsectionKeys.add(key));
      coverage.mappedPathCount += mappedPathCoverage.matchedPathKeys.length;
      if (mappedPathCoverage.matchedPathKeys.length > 0) {
        coverage.mappedPathSections.add(mapping.data.sectionCode);
      }
      if (mappedPathCoverage.usedFallback) {
        coverage.fallbackSections.add(mapping.data.sectionCode);
      }
    }
  }

  const articles = (wikipediaCatalog as any).articles.map((article: any) => ({
    ...article,
    sectionCodes: [...(articleCoverage.get(article.title)?.sectionCodes ?? [])],
    progressSubsectionKeys: [...(articleCoverage.get(article.title)?.progressSubsectionKeys ?? [])],
    mappedPathCount: articleCoverage.get(article.title)?.mappedPathCount ?? 0,
    mappedPathSectionCount: articleCoverage.get(article.title)?.mappedPathSections.size ?? 0,
    fallbackSectionCount: articleCoverage.get(article.title)?.fallbackSections.size ?? 0,
  }));

  return {
    entries: buildWikipediaAggregateEntries(articles, context.sectionLookup),
    partsMeta: context.partsMeta,
  };
}

async function buildIotLibraryPayload(): Promise<IotLibraryPayload> {
  const [context, iotMappings] = await Promise.all([
    loadSharedLibraryContext(),
    getCollection('iot-mappings'),
  ]);

  const catalogLookup = new Map((iotCatalog as any).episodes.map((episode: any) => [episode.pid, episode]));
  const episodeCoverage = new Map<string, {
    sectionCodes: Set<string>;
    progressSubsectionKeys: Set<string>;
    mappedPathCount: number;
    mappedPathSections: Set<string>;
    fallbackSections: Set<string>;
  }>();
  const episodeTitleLookup = new Map<string, string>();

  for (const mapping of iotMappings) {
    for (const episode of mapping.data.mappings) {
      if (!episodeCoverage.has(episode.pid)) {
        episodeCoverage.set(episode.pid, {
          sectionCodes: new Set(),
          progressSubsectionKeys: new Set(),
          mappedPathCount: 0,
          mappedPathSections: new Set(),
          fallbackSections: new Set(),
        });
      }

      const coverage = episodeCoverage.get(episode.pid)!;
      coverage.sectionCodes.add(mapping.data.sectionCode);
      const mappedPathCoverage = analyzeMappedOutlinePathCoverage(
        mapping.data.sectionCode,
        episode.relevantPathsAI,
        context.sectionOutlinePathIndex,
      );
      const progressCoverage = analyzeProgressSubsectionCoverage(
        mapping.data.sectionCode,
        episode.relevantPathsAI,
        context.sectionOutlinePathIndex,
      );

      progressCoverage.coverageKeys.forEach((key) => coverage.progressSubsectionKeys.add(key));
      coverage.mappedPathCount += mappedPathCoverage.matchedPathKeys.length;
      if (mappedPathCoverage.matchedPathKeys.length > 0) {
        coverage.mappedPathSections.add(mapping.data.sectionCode);
      }
      if (mappedPathCoverage.usedFallback) {
        coverage.fallbackSections.add(mapping.data.sectionCode);
      }
      if (!episodeTitleLookup.has(episode.pid)) {
        episodeTitleLookup.set(episode.pid, episode.episodeTitle);
      }
    }
  }

  const episodes = Array.from(episodeCoverage.keys()).map((pid) => {
    const catalogEntry = catalogLookup.get(pid);
    const coverage = episodeCoverage.get(pid);

    return {
      pid,
      title: catalogEntry?.title ?? episodeTitleLookup.get(pid) ?? pid,
      synopsis: catalogEntry?.description ?? catalogEntry?.synopsis,
      url: catalogEntry?.url ?? `https://www.bbc.co.uk/programmes/${pid}`,
      datePublished: catalogEntry?.datePublished,
      durationSeconds: catalogEntry?.durationSeconds,
      sectionCodes: [...(coverage?.sectionCodes ?? [])],
      progressSubsectionKeys: [...(coverage?.progressSubsectionKeys ?? [])],
      mappedPathCount: coverage?.mappedPathCount ?? 0,
      mappedPathSectionCount: coverage?.mappedPathSections.size ?? 0,
      fallbackSectionCount: coverage?.fallbackSections.size ?? 0,
    };
  });

  for (const [pid, catalogEntry] of catalogLookup) {
    if (episodeCoverage.has(pid)) continue;
    episodes.push({
      pid,
      title: catalogEntry.title ?? pid,
      synopsis: catalogEntry.description ?? catalogEntry.synopsis,
      url: catalogEntry.url ?? `https://www.bbc.co.uk/programmes/${pid}`,
      datePublished: catalogEntry.datePublished,
      durationSeconds: catalogEntry.durationSeconds,
      sectionCodes: [],
      progressSubsectionKeys: [],
      mappedPathCount: 0,
      mappedPathSectionCount: 0,
      fallbackSectionCount: 0,
    });
  }

  return {
    entries: buildIotAggregateEntries(episodes, context.sectionLookup),
    partsMeta: context.partsMeta,
  };
}

async function buildMacropaediaLibraryPayload(): Promise<MacropaediaLibraryPayload> {
  const context = await loadSharedLibraryContext();

  return {
    entries: buildMacropaediaAggregateEntries(context.sectionsWithMeta),
    partsMeta: context.partsMeta,
  };
}

export async function loadLibraryPayload<T extends RemoteLibraryType>(
  type: T,
): Promise<LibraryPayloadMap[T]> {
  const cached = payloadPromises[type] as Promise<LibraryPayloadMap[T]> | undefined;
  if (cached) return cached;

  const nextPromise = (async () => {
    switch (type) {
      case 'vsi':
        return buildVsiLibraryPayload();
      case 'wikipedia':
        return buildWikipediaLibraryPayload();
      case 'iot':
        return buildIotLibraryPayload();
      case 'macropaedia':
        return buildMacropaediaLibraryPayload();
      default:
        throw new Error(`Unsupported library type: ${type satisfies never}`);
    }
  })();

  payloadPromises[type] = nextPromise as Promise<LibraryPayloadMap[T]>;
  return nextPromise as Promise<LibraryPayloadMap[T]>;
}
