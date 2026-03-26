import { getCollection } from 'astro:content';
import wikiCatalog from '../data/wikipedia-catalog.json';
import iotCatalog from '../data/iot-catalog.json';
import { slugify } from './helpers';
import { formatIotEpisodeMeta } from './iotMetadata';
import { analyzeSubsectionCoverage, buildOutlineItemCoverage, buildSectionOutlinePathIndex } from './outlineCoverage';
import { loadOutlineGraph } from './outlineGraph';
import {
  buildIotAggregateEntries,
  buildMacropaediaAggregateEntries,
  buildVsiAggregateEntries,
  buildWikipediaAggregateEntries,
  formatEditionLabel,
  type ReadingSectionSummary,
} from './readingData';
import type { HomepageCoverageEntry, HomepageCoverageSource } from './homepageCoverageTypes';
import type { ReadingType } from './readingPreference';

function formatVsiMeta(entry: {
  author: string;
  number?: number;
  subject?: string;
  publicationYear?: number;
  edition?: number;
}): string {
  return [
    entry.author,
    entry.number ? `No. ${entry.number}` : null,
    formatEditionLabel(entry.edition),
    entry.publicationYear ? String(entry.publicationYear) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

async function loadSectionLookup(): Promise<{
  sections: Awaited<ReturnType<typeof getCollection<'sections'>>>;
  sectionLookup: Map<string, ReadingSectionSummary>;
}> {
  const sections = await getCollection('sections');
  const outline = await loadOutlineGraph();

  const sectionLookup = new Map<string, ReadingSectionSummary>(
    sections.map((entry) => [
      entry.data.sectionCode,
      {
        sectionCode: entry.data.sectionCode,
        sectionCodeDisplay: entry.data.sectionCodeDisplay,
        title: entry.data.title,
        partNumber: entry.data.partNumber,
        partTitle: outline.sectionMeta[entry.data.sectionCode]?.partTitle,
        divisionId: entry.data.divisionId,
        divisionTitle: outline.sectionMeta[entry.data.sectionCode]?.divisionTitle,
      },
    ]),
  );

  return { sections, sectionLookup };
}

export async function buildHomepageCoverageSource(
  type: ReadingType,
  baseUrl: string,
): Promise<HomepageCoverageSource> {
  const { sections, sectionLookup } = await loadSectionLookup();

  switch (type) {
    case 'vsi': {
      const mappings = await getCollection('vsi-mappings');
      const catalogCollections = await getCollection('vsi');
      const sectionsWithMeta = sections.map((entry) => ({
        ...entry.data,
        partTitle: sectionLookup.get(entry.data.sectionCode)?.partTitle,
        divisionTitle: sectionLookup.get(entry.data.sectionCode)?.divisionTitle,
      }));
      const entries = buildVsiAggregateEntries(
        sectionsWithMeta,
        mappings.map((entry) => entry.data),
        catalogCollections.flatMap((entry) => entry.data.titles),
      );
      const { outlineItemCounts, totalOutlineItems } = buildOutlineItemCoverage(
        sections.map((entry) => entry.data),
      );

      return {
        type,
        label: 'Oxford VSI',
        browseHref: `${baseUrl}/vsi#vsi-library`,
        browseLabel: 'Browse all Oxford VSI books',
        totalLabel: 'Books',
        totalDescription: 'Mapped Oxford Very Short Introductions in the reading list.',
        completedDescription: 'Uses the same Done state as the Section reading boxes.',
        itemSingular: 'book',
        itemPlural: 'books',
        includeSubsections: true,
        outlineItemCounts,
        totalOutlineItems,
        activeCoverageDescriptions: {
          part: 'Parts with at least one VSI covered by your checked titles.',
          division: 'Divisions with at least one VSI covered by your checked titles.',
          section: 'Sections with at least one VSI covered by your checked titles.',
          subsection: 'Mapped Subsection coverage from outline-path matches, with whole-Section fallback where path data is still missing.',
        },
        entries: entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.title,
          href: `${baseUrl}/vsi/${slugify(entry.title)}`,
          meta: formatVsiMeta(entry),
          sectionCount: entry.sectionCount,
          sections: entry.sections,
          subsectionKeys: entry.subsectionKeys,
        })),
      };
    }

    case 'wikipedia': {
      const wikiMappings = await getCollection('wiki-mappings');
      const sectionOutlinePathIndex = buildSectionOutlinePathIndex(
        sections.map((entry) => entry.data),
      );
      const articleCoverage = new Map<
        string,
        {
          sectionCodes: Set<string>;
          subsectionKeys: Set<string>;
          mappedPathCount: number;
          mappedPathSections: Set<string>;
          fallbackSections: Set<string>;
        }
      >();

      for (const mapping of wikiMappings) {
        for (const item of mapping.data.mappings) {
          if (!articleCoverage.has(item.articleTitle)) {
            articleCoverage.set(item.articleTitle, {
              sectionCodes: new Set(),
              subsectionKeys: new Set(),
              mappedPathCount: 0,
              mappedPathSections: new Set(),
              fallbackSections: new Set(),
            });
          }

          const coverage = articleCoverage.get(item.articleTitle)!;
          coverage.sectionCodes.add(mapping.data.sectionCode);
          const subsectionCoverage = analyzeSubsectionCoverage(
            mapping.data.sectionCode,
            item.relevantPathsAI,
            sectionOutlinePathIndex,
          );

          subsectionCoverage.coverageKeys.forEach((key) => coverage.subsectionKeys.add(key));
          coverage.mappedPathCount += subsectionCoverage.matchedPathKeys.length;
          if (subsectionCoverage.matchedPathKeys.length > 0) {
            coverage.mappedPathSections.add(mapping.data.sectionCode);
          }
          if (subsectionCoverage.usedFallback) {
            coverage.fallbackSections.add(mapping.data.sectionCode);
          }
        }
      }

      const articles = (wikiCatalog as any).articles.map((article: any) => ({
        ...article,
        sectionCodes: [...(articleCoverage.get(article.title)?.sectionCodes || [])],
        subsectionKeys: [...(articleCoverage.get(article.title)?.subsectionKeys || [])],
        mappedPathCount: articleCoverage.get(article.title)?.mappedPathCount || 0,
        mappedPathSectionCount: articleCoverage.get(article.title)?.mappedPathSections.size || 0,
        fallbackSectionCount: articleCoverage.get(article.title)?.fallbackSections.size || 0,
      }));

      const entries = buildWikipediaAggregateEntries(articles, sectionLookup);
      const { outlineItemCounts, totalOutlineItems } = buildOutlineItemCoverage(
        sections.map((entry) => entry.data),
      );

      return {
        type,
        label: 'Wikipedia',
        browseHref: `${baseUrl}/wikipedia#wikipedia-library`,
        browseLabel: 'Browse all Wikipedia articles',
        totalLabel: 'Articles',
        totalDescription: 'Mapped Wikipedia articles in the reading list.',
        completedDescription: 'Uses the same Done state as the Section reading boxes.',
        itemSingular: 'article',
        itemPlural: 'articles',
        includeSubsections: true,
        outlineItemCounts,
        totalOutlineItems,
        activeCoverageDescriptions: {
          part: 'Parts with at least one checked article.',
          division: 'Divisions with at least one checked article.',
          section: 'Sections with at least one checked article.',
          subsection: 'Mapped Subsection coverage from article path matches inside each Section.',
        },
        entries: entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.displayTitle ?? entry.title,
          href: `${baseUrl}/wikipedia/${slugify(entry.title)}`,
          meta: entry.lowestLevel ? `Vital level ${entry.lowestLevel}` : undefined,
          sectionCount: entry.sectionCount,
          sections: entry.sections,
          subsectionKeys: entry.subsectionKeys,
        })),
      };
    }

    case 'iot': {
      const iotMappings = await getCollection('iot-mappings');
      const sectionOutlinePathIndex = buildSectionOutlinePathIndex(
        sections.map((entry) => entry.data),
      );
      const episodeCoverage = new Map<
        string,
        {
          sectionCodes: Set<string>;
          subsectionKeys: Set<string>;
          mappedPathCount: number;
          mappedPathSections: Set<string>;
          fallbackSections: Set<string>;
        }
      >();
      const episodeTitleLookup = new Map<string, string>();

      for (const mapping of iotMappings) {
        for (const item of mapping.data.mappings) {
          if (!episodeTitleLookup.has(item.pid)) {
            episodeTitleLookup.set(item.pid, item.episodeTitle);
          }

          if (!episodeCoverage.has(item.pid)) {
            episodeCoverage.set(item.pid, {
              sectionCodes: new Set(),
              subsectionKeys: new Set(),
              mappedPathCount: 0,
              mappedPathSections: new Set(),
              fallbackSections: new Set(),
            });
          }

          const coverage = episodeCoverage.get(item.pid)!;
          coverage.sectionCodes.add(mapping.data.sectionCode);
          const subsectionCoverage = analyzeSubsectionCoverage(
            mapping.data.sectionCode,
            item.relevantPathsAI,
            sectionOutlinePathIndex,
          );

          subsectionCoverage.coverageKeys.forEach((key) => coverage.subsectionKeys.add(key));
          coverage.mappedPathCount += subsectionCoverage.matchedPathKeys.length;
          if (subsectionCoverage.matchedPathKeys.length > 0) {
            coverage.mappedPathSections.add(mapping.data.sectionCode);
          }
          if (subsectionCoverage.usedFallback) {
            coverage.fallbackSections.add(mapping.data.sectionCode);
          }
        }
      }

      const catalogLookup = new Map((iotCatalog as any).episodes.map((episode: any) => [episode.pid, episode]));
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
          sectionCodes: [...(coverage?.sectionCodes || [])],
          subsectionKeys: [...(coverage?.subsectionKeys || [])],
          mappedPathCount: coverage?.mappedPathCount || 0,
          mappedPathSectionCount: coverage?.mappedPathSections.size || 0,
          fallbackSectionCount: coverage?.fallbackSections.size || 0,
        };
      });

      const entries = buildIotAggregateEntries(episodes, sectionLookup);
      const { outlineItemCounts, totalOutlineItems } = buildOutlineItemCoverage(
        sections.map((entry) => entry.data),
      );

      return {
        type,
        label: 'BBC In Our Time',
        browseHref: `${baseUrl}/iot#iot-library`,
        browseLabel: 'Browse all BBC episodes',
        totalLabel: 'Episodes',
        totalDescription: 'Mapped BBC In Our Time episodes in the listening list.',
        completedDescription: 'Uses the same Done state as the Section reading boxes.',
        itemSingular: 'episode',
        itemPlural: 'episodes',
        includeSubsections: true,
        outlineItemCounts,
        totalOutlineItems,
        activeCoverageDescriptions: {
          part: 'Parts with at least one checked episode.',
          division: 'Divisions with at least one checked episode.',
          section: 'Sections with at least one checked episode.',
          subsection: 'Mapped Subsection coverage from episode path matches inside each Section.',
        },
        entries: entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.title,
          href: `${baseUrl}/iot/${entry.pid}`,
          meta: formatIotEpisodeMeta(entry) || undefined,
          sectionCount: entry.sectionCount,
          sections: entry.sections,
          subsectionKeys: entry.subsectionKeys,
        })),
      };
    }

    case 'macropaedia': {
      const sectionsWithMeta = sections.map((entry) => ({
        ...entry.data,
        partTitle: sectionLookup.get(entry.data.sectionCode)?.partTitle,
        divisionTitle: sectionLookup.get(entry.data.sectionCode)?.divisionTitle,
      }));
      const entries = buildMacropaediaAggregateEntries(sectionsWithMeta);

      return {
        type,
        label: 'Macropaedia',
        browseHref: `${baseUrl}/macropaedia#macropaedia-library`,
        browseLabel: 'Browse all Britannica articles',
        totalLabel: 'Articles',
        totalDescription: 'Macropaedia articles referenced directly from the outline.',
        completedDescription: 'Uses the same Done state as the Section reading boxes.',
        itemSingular: 'article',
        itemPlural: 'articles',
        includeSubsections: false,
        activeCoverageDescriptions: {
          part: 'Parts with at least one Macropaedia article covered by your checked list.',
          division: 'Divisions with at least one Macropaedia article covered by your checked list.',
          section: 'Sections with at least one Macropaedia article covered by your checked list.',
        },
        entries: entries.map((entry) => ({
          checklistKey: entry.checklistKey,
          title: entry.title,
          href: `${baseUrl}/macropaedia/${slugify(entry.title)}`,
          sectionCount: entry.sectionCount,
          sections: entry.sections,
        })),
      };
    }
  }
}
