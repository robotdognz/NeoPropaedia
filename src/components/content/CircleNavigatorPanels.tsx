import { h, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  macropaediaChecklistKey,
  vsiChecklistKey,
  wikipediaChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import type { ReadingType } from '../../utils/readingPreference';
import { divisionUrl, sectionUrl, slugify } from '../../utils/helpers';
import {
  buildMacropaediaCoverageSnapshot,
  buildVsiCoverageSnapshot,
  buildWikipediaCoverageSnapshot,
  type ReadingSectionSummary,
} from '../../utils/readingData';
import { completedChecklistKeysFromState } from '../../utils/readingLibrary';
import Accordion from '../ui/Accordion';
import ReadingSectionLinks from './ReadingSectionLinks';
import type {
  BridgeItem,
  BridgePair,
  CircleNavigatorMacropaediaEntry,
  CircleNavigatorPart,
  CircleNavigatorPartRecommendations,
  CircleNavigatorVsiEntry,
  CircleNavigatorWikipediaEntry,
  ConnectionSummary,
} from './circleNavigatorShared';
import { getConnectionKey } from './circleNavigatorShared';

interface CenteredCircleNavigatorPanelProps {
  parts: CircleNavigatorPart[];
  centerPart: CircleNavigatorPart;
  centerPartNumber: number;
  topPart: CircleNavigatorPart;
  connectionSummary: ConnectionSummary | null;
  suggestedSections: ConnectionSummary['sections'];
  bridgeRecommendations: Record<string, BridgePair>;
  readingPref: ReadingType;
  checklistState: Record<string, boolean>;
  baseUrl: string;
}

interface TopPartCircleNavigatorPanelProps {
  topPart: CircleNavigatorPart;
  topPartNumber: number;
  readingPref: ReadingType;
  checklistState: Record<string, boolean>;
  baseUrl: string;
}

interface BridgeRecommendationSectionConfig {
  items: BridgeItem[];
  type: ReadingType;
  title: string;
  maxTotal: number;
  browseHref: string;
  browseLabel: string;
  getHref: (item: BridgeItem) => string;
  getCheckKey: (item: BridgeItem) => string;
}

type AnchoredEntryBase = {
  title: string;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
};

type AnchoredRecommendationItem<TEntry extends AnchoredEntryBase> = {
  entry: TEntry;
  newSectionCount: number;
  cumulativeCoveredSectionCount: number;
  newSections: ReadingSectionSummary[];
  isCompleted: boolean;
};

type AnchoredRecommendationResult<TEntry extends AnchoredEntryBase> = {
  unreadItems: AnchoredRecommendationItem<TEntry>[];
  completedItems: AnchoredRecommendationItem<TEntry>[];
  overlapOnlyUnreadCount: number;
  totalUnreadLinkedCount: number;
};

interface AnchoredRecommendationSectionConfig<TEntry extends AnchoredEntryBase> {
  type: ReadingType;
  title: string;
  browseHref: string;
  browseLabel: string;
  itemSingular: string;
  totalCount: number;
  unreadCount: number;
  completedCount: number;
  remainingSections: number;
  overlapOnlyUnreadCount: number;
  totalUnreadLinkedCount: number;
  unreadItems: AnchoredRecommendationItem<TEntry>[];
  completedItems: AnchoredRecommendationItem<TEntry>[];
  getHref: (item: TEntry) => string;
  getLabel?: (item: TEntry) => string;
  renderMeta?: (item: TEntry) => ComponentChildren;
}

const partRecommendationCache = new Map<number, CircleNavigatorPartRecommendations>();

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function countPartsSpanned(sections: ReadingSectionSummary[]): number {
  return new Set(sections.map((section) => section.partNumber)).size;
}

function buildAnchoredRecommendationItems<TEntry extends AnchoredEntryBase>(
  entries: TEntry[],
  checklistState: Record<string, boolean>,
  snapshot: {
    currentlyCoveredSections: number;
    totalCoveredSections: number;
    path: Array<{
      checklistKey: string;
      newSectionCount: number;
      cumulativeCoveredSectionCount: number;
      newSections: ReadingSectionSummary[];
    }>;
  }
): AnchoredRecommendationResult<TEntry> {
  const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
  const entryLookup = new Map(entries.map((entry) => [entry.checklistKey, entry]));

  const unreadItems = snapshot.path.flatMap((step) => {
    const entry = entryLookup.get(step.checklistKey);
    if (!entry || completedChecklistKeys.has(step.checklistKey)) return [];
    return [{
      entry,
      newSectionCount: step.newSectionCount,
      cumulativeCoveredSectionCount: step.cumulativeCoveredSectionCount,
      newSections: step.newSections,
      isCompleted: false,
    }];
  });

  const totalUnreadLinkedCount = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey)).length;
  const overlapOnlyUnreadCount = totalUnreadLinkedCount - unreadItems.length;

  const completedItems = entries
    .filter((entry) => completedChecklistKeys.has(entry.checklistKey))
    .map((entry) => ({
      entry,
      newSectionCount: 0,
      cumulativeCoveredSectionCount: snapshot.currentlyCoveredSections,
      newSections: [],
      isCompleted: true,
    }));

  return { unreadItems, completedItems, overlapOnlyUnreadCount, totalUnreadLinkedCount };
}

function renderAnchoredRecommendationSection<TEntry extends AnchoredEntryBase>(
  section: AnchoredRecommendationSectionConfig<TEntry>,
  options: {
    topPart: CircleNavigatorPart;
    topPartNumber: number;
    readingPref: ReadingType;
    checklistState: Record<string, boolean>;
    baseUrl: string;
  }
) {
  const {
    topPart,
    topPartNumber,
    readingPref,
    checklistState,
    baseUrl,
  } = options;

  const renderItem = (
    item: AnchoredRecommendationItem<TEntry>,
    indexLabel: string
  ) => {
    const isChecked = Boolean(checklistState[item.entry.checklistKey]);
    const sectionsInPart = item.entry.sections.filter((entrySection) => entrySection.partNumber === topPartNumber);
    const linkedPartCount = countPartsSpanned(item.entry.sections);
    const sectionLinkSections = item.newSectionCount > 0 ? item.newSections : sectionsInPart;
    const sectionLinkLabel = item.newSectionCount > 0
      ? `Show the ${item.newSectionCount} new ${pluralize(item.newSectionCount, 'section')}`
      : `Show the ${sectionsInPart.length} ${pluralize(sectionsInPart.length, 'linked section')} in ${topPart.partName}`;

    return (
      <li
        key={item.entry.checklistKey}
        class={`rounded-xl border p-4 transition-colors ${item.isCompleted ? 'border-slate-200 bg-slate-100/80' : 'border-slate-200 bg-white'}`}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
              {indexLabel}
            </p>
            <h4 class="mt-1 font-serif text-lg leading-tight text-slate-900">
              <a href={section.getHref(item.entry)} class="transition-colors hover:text-indigo-700">
                {section.getLabel ? section.getLabel(item.entry) : item.entry.title}
              </a>
            </h4>
            {section.renderMeta ? (
              <div class="mt-1 text-sm text-slate-600">{section.renderMeta(item.entry)}</div>
            ) : null}
          </div>
          <label class="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => writeChecklistState(item.entry.checklistKey, (event.currentTarget as HTMLInputElement).checked)}
              class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Done
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          {item.isCompleted ? (
            <span class="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
              Already marked done
            </span>
          ) : (
            <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
              +{item.newSectionCount} new {pluralize(item.newSectionCount, 'section')}
            </span>
          )}
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {item.entry.sectionCount} total {pluralize(item.entry.sectionCount, 'section')}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {sectionsInPart.length} in {topPart.partName}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            Spans {linkedPartCount} {pluralize(linkedPartCount, 'part')}
          </span>
        </div>

        {sectionLinkSections.length > 0 && (
          <ReadingSectionLinks
            sections={sectionLinkSections}
            baseUrl={baseUrl}
            label={sectionLinkLabel}
            variant="chips"
          />
        )}
      </li>
    );
  };

  return (
    <Accordion
      key={section.type}
      title={`${section.title} (${section.unreadCount})`}
      forceOpenKey={readingPref === section.type ? 0 : undefined}
      forceCloseKey={readingPref !== section.type ? 0 : undefined}
    >
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p class="max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
          {section.totalUnreadLinkedCount} unread {pluralize(section.totalUnreadLinkedCount, section.itemSingular)} linked to {topPart.title}.
          {' '}Showing the {section.unreadCount} that still add new section coverage across the whole outline.
          {' '}{section.remainingSections > 0
            ? `${section.remainingSections} ${pluralize(section.remainingSections, 'section')} remain uncovered from this anchored list.`
            : `Your checked ${pluralize(section.completedCount, section.itemSingular)} already cover every mapped section this anchored list can reach.`}
        </p>
        <a
          href={section.browseHref}
          class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          {section.browseLabel}
        </a>
      </div>

      {section.unreadItems.length > 0 ? (
        <ol class="space-y-3">
          {section.unreadItems.map((item, index) =>
            renderItem(item, `Step ${index + 1}`)
          )}
        </ol>
      ) : (
        <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          {section.totalUnreadLinkedCount === 0
            ? `Every linked ${section.itemSingular} here is already marked done.`
            : section.overlapOnlyUnreadCount > 0
              ? `No unread linked ${pluralize(section.overlapOnlyUnreadCount, section.itemSingular)} add any new section coverage right now.`
              : `No additional linked ${pluralize(0, section.itemSingular)} are available right now.`}
        </div>
      )}

      {section.completedItems.length > 0 && (
        <div class="mt-5 border-t border-slate-200 pt-4">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Already marked done ({section.completedItems.length})
          </p>
          <ol class="mt-3 space-y-3">
            {section.completedItems.map((item) => renderItem(item, 'Done'))}
          </ol>
        </div>
      )}
    </Accordion>
  );
}

export function CenteredCircleNavigatorPanel({
  parts,
  centerPart,
  centerPartNumber,
  topPart,
  connectionSummary,
  suggestedSections,
  bridgeRecommendations,
  readingPref,
  checklistState,
  baseUrl,
}: CenteredCircleNavigatorPanelProps) {
  const bridgeKey = getConnectionKey(centerPartNumber, topPart.partNumber);
  const bridge = bridgeRecommendations[bridgeKey];
  const isFlipped = centerPartNumber > topPart.partNumber;
  const bridgeVsi = bridge?.vsi ?? [];
  const bridgeWiki = bridge?.wiki ?? [];
  const bridgeMacro = bridge?.macro ?? [];
  const bridgeSections: BridgeRecommendationSectionConfig[] = [
    {
      items: bridgeVsi,
      type: 'vsi',
      title: 'Oxford VSI Recommendations',
      maxTotal: bridgeVsi.length > 0 ? Math.max(...bridgeVsi.map((item) => item.ca + item.cb)) : 1,
      browseHref: `${baseUrl}/vsi`,
      browseLabel: 'Browse all Oxford VSI books',
      getHref: (item) => `${baseUrl}/vsi/${slugify(item.t)}`,
      getCheckKey: (item) => vsiChecklistKey(item.t, item.a || ''),
    },
    {
      items: bridgeWiki,
      type: 'wikipedia',
      title: 'Wikipedia Article Recommendations',
      maxTotal: bridgeWiki.length > 0 ? Math.max(...bridgeWiki.map((item) => item.ca + item.cb)) : 1,
      browseHref: `${baseUrl}/wikipedia`,
      browseLabel: 'Browse all Wikipedia articles',
      getHref: (item) => `${baseUrl}/wikipedia/${slugify(item.t)}`,
      getCheckKey: (item) => wikipediaChecklistKey(item.t),
    },
    {
      items: bridgeMacro,
      type: 'macropaedia',
      title: 'Macropaedia Reading List',
      maxTotal: bridgeMacro.length > 0 ? Math.max(...bridgeMacro.map((item) => item.ca + item.cb)) : 1,
      browseHref: `${baseUrl}/macropaedia`,
      browseLabel: 'Browse all Macropaedia articles',
      getHref: (item) => `${baseUrl}/macropaedia/${slugify(item.t)}`,
      getCheckKey: (item) => macropaediaChecklistKey(item.t),
    },
  ]
    .filter((section) => section.items.length > 0)
    .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));

  return (
    <>
      <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
        Circle of learning
      </p>
      <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
        Centred on {centerPart.title}, with {topPart.title} at the top.
        {suggestedSections.length > 0 && centerPartNumber !== topPart.partNumber && (
          <>{' '}See where these fields connect below.</>
        )}
      </p>

      {suggestedSections.length > 0 && connectionSummary && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            Connected sections
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
            {connectionSummary.isDirect
              ? `Sections where ${centerPart.title} and ${topPart.title} cross-reference each other${connectionSummary.hasKeyword ? ', supplemented by sections with related subject matter.' : '.'}`
              : connectionSummary.hasConnectionData
                ? `Sections that connect ${centerPart.title} and ${topPart.title} through shared references and related subject matter.`
                : `Sections with related subject matter across ${centerPart.title} and ${topPart.title}.`}
          </p>
          <ul class="mt-2 space-y-1">
            {suggestedSections.map((item) => {
              const part = parts.find((candidate) => candidate.partNumber === item.section.partNumber);
              return (
                <li key={item.section.sectionCode}>
                  <a
                    href={sectionUrl(item.section.sectionCode, baseUrl)}
                    class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                  >
                    <span
                      class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: part?.colorHex || '#94a3b8' }}
                    />
                    <span class="text-slate-700 group-hover:text-indigo-700">{item.section.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {bridgeSections.length > 0 && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            Recommended Readings
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
            Books and articles independently recommended for both {centerPart.partName}: {centerPart.title} and {topPart.partName}: {topPart.title}. Ranked by how deeply they connect the two parts - considering sections, outline items, and overall spread. The bar shows the balance of coverage between the two chosen parts.
          </p>
          <div class="mt-3 flex items-center gap-3 text-[10px] font-sans text-slate-400">
            <span class="flex items-center gap-1">
              <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: centerPart.colorHex }} />
              {centerPart.partName}
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: topPart.colorHex }} />
              {topPart.partName}
            </span>
          </div>
          <div class="mt-3 space-y-4">
            {bridgeSections.map((section) => (
              <Accordion
                key={section.type}
                title={`${section.title} (${section.items.length})`}
                forceOpenKey={readingPref === section.type ? 0 : undefined}
                forceCloseKey={readingPref !== section.type ? 0 : undefined}
              >
                <div class="mb-4 flex justify-end">
                  <a href={section.browseHref} class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline">
                    {section.browseLabel}
                  </a>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => {
                    const centerCount = isFlipped ? item.cb : item.ca;
                    const topCount = isFlipped ? item.ca : item.cb;
                    const relevancePct = item.r ?? Math.round(((centerCount + topCount) / section.maxTotal) * 100);
                    const total = centerCount + topCount;
                    const scale = relevancePct / 100;
                    const centerPct = total > 0 ? Math.round((centerCount / total) * scale * 100) : 0;
                    const topPct = total > 0 ? Math.round((topCount / total) * scale * 100) : 0;
                    const checkKey = section.getCheckKey(item);
                    const isChecked = Boolean(checklistState[checkKey]);
                    const whyLabel = section.type === 'vsi' ? 'Why this book?' : 'Why this article?';
                    const balanceDesc = Math.abs(centerCount - topCount) <= 1
                      ? 'with roughly equal coverage of both'
                      : centerCount > topCount
                        ? `leaning more toward ${centerPart.title}`
                        : `leaning more toward ${topPart.title}`;
                    const rationale = `Independently recommended in ${centerCount} section${centerCount !== 1 ? 's' : ''} of ${centerPart.title} and ${topCount} section${topCount !== 1 ? 's' : ''} of ${topPart.title}, ${balanceDesc}. Items are ranked higher when they bridge both parts evenly rather than being concentrated in one.`;

                    return (
                      <div
                        key={item.t}
                        class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-slate-300 bg-slate-200/70 opacity-50' : 'border-gray-200'}`}
                      >
                        <div class="mb-2 flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">
                              <a href={section.getHref(item)} class="hover:text-indigo-700 transition-colors">{item.t}</a>
                            </h4>
                            {item.a && <p class="text-sm text-gray-500 mt-0.5">{item.a}</p>}
                          </div>
                          <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => writeChecklistState(checkKey, (event.currentTarget as HTMLInputElement).checked)}
                              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            Done
                          </label>
                        </div>
                        <div class="mb-3 flex items-center gap-2">
                          <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div class="flex h-full">
                              <div class="rounded-l-full" style={{ width: `${centerPct}%`, backgroundColor: centerPart.colorHex }} />
                              <div style={{ width: `${topPct}%`, backgroundColor: topPart.colorHex, borderRadius: centerPct === 0 ? '9999px 0 0 9999px' : topPct + centerPct >= 100 ? '0 9999px 9999px 0' : '0' }} />
                            </div>
                          </div>
                          <span class="text-[10px] font-sans text-gray-400 whitespace-nowrap">{relevancePct}% relevance</span>
                        </div>
                        <Accordion title={whyLabel} defaultOpen={false}>
                          <p class="text-gray-600">{rationale}</p>
                        </Accordion>
                      </div>
                    );
                  })}
                </div>
              </Accordion>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function TopPartCircleNavigatorPanel({
  topPart,
  topPartNumber,
  readingPref,
  checklistState,
  baseUrl,
}: TopPartCircleNavigatorPanelProps) {
  const [partRecommendations, setPartRecommendations] = useState<CircleNavigatorPartRecommendations | null>(
    () => partRecommendationCache.get(topPartNumber) ?? null
  );
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

  useEffect(() => {
    const cached = partRecommendationCache.get(topPartNumber);
    if (cached) {
      setPartRecommendations(cached);
      setRecommendationsError(null);
      return;
    }

    const controller = new AbortController();
    setPartRecommendations(null);
    setRecommendationsError(null);

    fetch(joinBaseUrl(baseUrl, `circle-anchored/${topPartNumber}.json`), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load recommendations for Part ${topPartNumber}.`);
        }
        return response.json();
      })
      .then((data: CircleNavigatorPartRecommendations) => {
        partRecommendationCache.set(topPartNumber, data);
        setPartRecommendations(data);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setRecommendationsError(error instanceof Error ? error.message : 'Unable to load recommendations.');
      });

    return () => controller.abort();
  }, [topPartNumber, baseUrl]);

  const recommendationSections = useMemo(() => {
    if (!partRecommendations) return [];

    const belongsToPart = (section: ReadingSectionSummary) => section.partNumber === topPartNumber;
    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);

    const anchoredVsiEntries = partRecommendations.vsi.filter((entry) => entry.sections.some(belongsToPart));
    const vsiSnapshot = buildVsiCoverageSnapshot(anchoredVsiEntries, completedChecklistKeys);
    const vsiRecommendations = buildAnchoredRecommendationItems(anchoredVsiEntries, checklistState, vsiSnapshot);

    const anchoredWikiEntries = partRecommendations.wiki.filter((entry) => entry.sections.some(belongsToPart));
    const wikiSnapshot = buildWikipediaCoverageSnapshot(anchoredWikiEntries, completedChecklistKeys);
    const wikiRecommendations = buildAnchoredRecommendationItems(anchoredWikiEntries, checklistState, wikiSnapshot);

    const anchoredMacroEntries = partRecommendations.macro.filter((entry) => entry.sections.some(belongsToPart));
    const macroSnapshot = buildMacropaediaCoverageSnapshot(anchoredMacroEntries, completedChecklistKeys);
    const macroRecommendations = buildAnchoredRecommendationItems(anchoredMacroEntries, checklistState, macroSnapshot);

    return [
      {
        type: 'vsi' as const,
        title: 'Oxford VSI Recommendations',
        browseHref: `${baseUrl}/vsi`,
        browseLabel: 'Browse all Oxford VSI books',
        itemSingular: 'book',
        totalCount: anchoredVsiEntries.length,
        unreadCount: vsiRecommendations.unreadItems.length,
        completedCount: vsiRecommendations.completedItems.length,
        remainingSections: vsiSnapshot.remainingSections,
        overlapOnlyUnreadCount: vsiRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: vsiRecommendations.totalUnreadLinkedCount,
        unreadItems: vsiRecommendations.unreadItems,
        completedItems: vsiRecommendations.completedItems,
        getHref: (item: CircleNavigatorVsiEntry) => `${baseUrl}/vsi/${slugify(item.title)}`,
        renderMeta: (item: CircleNavigatorVsiEntry) => item.author,
      },
      {
        type: 'wikipedia' as const,
        title: 'Wikipedia Article Recommendations',
        browseHref: `${baseUrl}/wikipedia`,
        browseLabel: 'Browse all Wikipedia articles',
        itemSingular: 'article',
        totalCount: anchoredWikiEntries.length,
        unreadCount: wikiRecommendations.unreadItems.length,
        completedCount: wikiRecommendations.completedItems.length,
        remainingSections: wikiSnapshot.remainingSections,
        overlapOnlyUnreadCount: wikiRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: wikiRecommendations.totalUnreadLinkedCount,
        unreadItems: wikiRecommendations.unreadItems,
        completedItems: wikiRecommendations.completedItems,
        getHref: (item: CircleNavigatorWikipediaEntry) => `${baseUrl}/wikipedia/${slugify(item.title)}`,
        getLabel: (item: CircleNavigatorWikipediaEntry) => item.displayTitle || item.title,
        renderMeta: (item: CircleNavigatorWikipediaEntry) => `Vital Articles Level ${item.lowestLevel}`,
      },
      {
        type: 'macropaedia' as const,
        title: 'Macropaedia Reading List',
        browseHref: `${baseUrl}/macropaedia`,
        browseLabel: 'Browse all Macropaedia articles',
        itemSingular: 'article',
        totalCount: anchoredMacroEntries.length,
        unreadCount: macroRecommendations.unreadItems.length,
        completedCount: macroRecommendations.completedItems.length,
        remainingSections: macroSnapshot.remainingSections,
        overlapOnlyUnreadCount: macroRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: macroRecommendations.totalUnreadLinkedCount,
        unreadItems: macroRecommendations.unreadItems,
        completedItems: macroRecommendations.completedItems,
        getHref: (item: CircleNavigatorMacropaediaEntry) => `${baseUrl}/macropaedia/${slugify(item.title)}`,
      },
    ]
      .filter((section) => section.totalCount > 0)
      .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));
  }, [topPartNumber, readingPref, checklistState, partRecommendations, baseUrl]);

  return (
    <>
      <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
        Circle of learning
      </p>
      <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
        {topPart.title} is at the top. Start here if you want readings that touch this part but open out as
        widely as possible across the whole outline.
      </p>

      <div class="mt-3 border-t border-slate-200 pt-3">
        <a
          href={`${topPart.href}?view=essay#essay`}
          class="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          Read essay
        </a>
      </div>

      {topPart.divisions.length > 0 && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            {topPart.divisions.length} {topPart.divisions.length === 1 ? 'Division' : 'Divisions'}
          </p>
          <ul class="mt-2 space-y-1">
            {topPart.divisions.map((division) => (
              <li key={division.divisionId}>
                <a
                  href={divisionUrl(division.divisionId, baseUrl)}
                  class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                >
                  <span
                    class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: topPart.colorHex }}
                  />
                  <span class="text-slate-700 group-hover:text-indigo-700">
                    <span class="text-slate-400">{division.romanNumeral}.</span>{' '}{division.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="mt-3 border-t border-slate-200 pt-3">
        <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
          Recommended Readings
        </p>
        <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
          Every item below is linked to {topPart.partName}. Unread items are ranked by how much new section
          coverage they add across the whole outline from your current checklist. Items that add no new
          section coverage are left out of this list.
        </p>

        {recommendationsError ? (
          <div class="mt-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            {recommendationsError}
          </div>
        ) : !partRecommendations ? (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Loading anchored recommendations for {topPart.partName}...
          </div>
        ) : recommendationSections.length > 0 ? (
          <div class="mt-3 space-y-4">
            {recommendationSections.map((section) =>
              renderAnchoredRecommendationSection(section, {
                topPart,
                topPartNumber,
                readingPref,
                checklistState,
                baseUrl,
              })
            )}
          </div>
        ) : (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No mapped readings are currently available for this part.
          </div>
        )}
      </div>
    </>
  );
}
