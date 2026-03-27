import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import VsiCard from './VsiCard';
import WikipediaCard from './WikipediaCard';
import IotCard from './IotCard';
import HorizontalCardScroll from '../ui/HorizontalCardScroll';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
import type { ReadingType } from '../../utils/readingPreference';
import {
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
  getHideCheckedReadings,
  getReadingPreference,
  setHideCheckedReadings,
  setReadingPreference,
  subscribeHideCheckedReadings,
  subscribeReadingPreference,
} from '../../utils/readingPreference';
import {
  iotChecklistKey,
  macropaediaChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  vsiChecklistKey,
  wikipediaChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  OUTLINE_SELECT_EVENT,
  filterMappingsForOutline,
  sortByDefaultRelevance,
  type OutlineSelectionDetail,
} from '../../utils/vsiOutlineFilter';
import {
  filterArticlesForOutline,
} from '../../utils/wikipediaOutlineFilter';
import {
  filterEpisodesForOutline,
} from '../../utils/iotOutlineFilter';
import { classifyMappingPrecision, mappingPrecisionBadge } from '../../utils/mappingPrecision';
import { slugify } from '../../utils/helpers';
import type {
  EnrichedIotEpisode,
  EnrichedVsiMapping,
  EnrichedWikiArticle,
} from '../../utils/sectionReadingContext';

interface SectionReadingRecommendationsProps {
  vsiMappings: EnrichedVsiMapping[];
  wikiArticles: EnrichedWikiArticle[];
  iotEpisodes: EnrichedIotEpisode[];
  macropaediaReferences: string[];
  sectionCode: string;
  sectionTitle: string;
  sectionOutlineText?: string;
  baseUrl: string;
}

type KnowledgeLevel = 1 | 2 | 3;

interface ActiveSectionRecommendationPanel {
  title: string;
  browseHref: string;
  browseLabel: string;
  totalCount: number;
  visibleCount: number;
  toolbarLabel?: string;
  selectionNotice?: string | null;
  body: h.JSX.Element;
}

const WIKIPEDIA_LEVEL_STORAGE_KEY = 'propaedia-wiki-level';

function getStoredLevel(): KnowledgeLevel {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(WIKIPEDIA_LEVEL_STORAGE_KEY);
  if (stored === '1' || stored === '2' || stored === '3') {
    return Number(stored) as KnowledgeLevel;
  }
  return 3;
}

function resolveAvailableReadingType(type: ReadingType, availableTypes: ReadingType[]): ReadingType {
  if (availableTypes.includes(type)) return type;
  return availableTypes[0] ?? 'vsi';
}

function recommendationPanelClass() {
  return 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5';
}

function emptyStateClass() {
  return 'rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-amber-900/80';
}

function wikipediaLevelLabel(level: KnowledgeLevel): string {
  if (level === 1) return 'Level 1 (Top 10)';
  if (level === 2) return 'Level 2 (Top 100)';
  return 'Level 3 (~1,000)';
}

export default function SectionReadingRecommendations({
  vsiMappings,
  wikiArticles,
  iotEpisodes,
  macropaediaReferences,
  sectionCode,
  sectionTitle,
  sectionOutlineText,
  baseUrl,
}: SectionReadingRecommendationsProps) {
  const typeCounts: Record<ReadingType, number> = {
    vsi: vsiMappings.length,
    wikipedia: wikiArticles.length,
    iot: iotEpisodes.length,
    macropaedia: macropaediaReferences.length,
  };
  const availableTypes = READING_TYPE_ORDER.filter((type) => typeCounts[type] > 0);
  const availableTypesKey = availableTypes.join('|');
  const [selectedType, setSelectedType] = useState<ReadingType>(() => resolveAvailableReadingType(getReadingPreference(), availableTypes));
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [hideChecked, setHideChecked] = useState(() => getHideCheckedReadings());
  const [wikiLevel, setWikiLevel] = useState<KnowledgeLevel>(3);
  const panelRef = useRef<HTMLElement>(null);
  const activeType = resolveAvailableReadingType(selectedType, availableTypes);

  useEffect(() => {
    if (!availableTypes.length) return;
    setSelectedType((current) => resolveAvailableReadingType(current, availableTypes));
  }, [availableTypesKey]);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    return subscribeHideCheckedReadings((hide) => setHideChecked(hide));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setWikiLevel(getStoredLevel());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== WIKIPEDIA_LEVEL_STORAGE_KEY) return;
      setWikiLevel(getStoredLevel());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    return subscribeReadingPreference((type) => {
      setSelectedType(resolveAvailableReadingType(type, availableTypes));
    });
  }, [availableTypesKey]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;
      setSelection(detail);
      if (panelRef.current) {
        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    };
    document.addEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
    return () => document.removeEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
  }, [sectionCode]);

  const typeOptions = READING_TYPE_ORDER.map((type) => ({
    value: type,
    eyebrow: READING_TYPE_UI_META[type].eyebrow,
    label: READING_TYPE_UI_META[type].label,
    disabled: typeCounts[type] === 0,
  }));

  const headerMeta = useMemo<ActiveSectionRecommendationPanel>(() => {
    if (activeType === 'vsi') {
      const scoredMappings = sortByDefaultRelevance(vsiMappings, sectionTitle, sectionOutlineText);
      const visibleMappings = selection ? filterMappingsForOutline(scoredMappings, selection) : scoredMappings;
      const displayMappings = hideChecked
        ? visibleMappings.filter((mapping) => !checklistState[vsiChecklistKey(mapping.vsiTitle, mapping.vsiAuthor)])
        : visibleMappings;
      const maxScore = selection
        ? Math.max(...displayMappings.map((mapping) => mapping.filterScore ?? 0), 1)
        : Math.max(...scoredMappings.map((mapping) => mapping.relevanceScore ?? 0), 1);

      return {
        title: `Oxford VSI Recommendations (${vsiMappings.length})`,
        browseHref: `${baseUrl}/vsi#vsi-library`,
        browseLabel: 'Browse all Oxford VSI books',
        totalCount: vsiMappings.length,
        visibleCount: displayMappings.length,
        body: displayMappings.length > 0 ? (
          <HorizontalCardScroll>
            {displayMappings.map((mapping, index) => {
              const checklistKey = vsiChecklistKey(mapping.vsiTitle, mapping.vsiAuthor);
              const relevanceScore = mapping.filterScore ?? mapping.relevanceScore ?? 0;
              const precision = mappingPrecisionBadge(
                classifyMappingPrecision(mapping.relevantPathsAI, selection?.outlinePath ?? null),
              );

              return (
                <VsiCard
                  key={`${mapping.vsiTitle}-${mapping.vsiAuthor}-${index}`}
                  title={mapping.vsiTitle}
                  author={mapping.vsiAuthor}
                  rationale={mapping.rationaleAI}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  publicationYear={mapping.publicationYear}
                  edition={mapping.edition}
                  matchPercent={Math.round(Math.min(relevanceScore / maxScore, 1) * 100)}
                  precisionLabel={precision.label}
                  precisionClassName={precision.className}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class={emptyStateClass()}>
            No Oxford VSI recommendations matched this outline item.
          </div>
        ),
      };
    }

    if (activeType === 'wikipedia') {
      const levelFiltered = wikiArticles.filter((article) => (article.lowestLevel || 3) <= wikiLevel);
      const visibleArticles = selection
        ? filterArticlesForOutline(levelFiltered, selection)
        : [...levelFiltered].sort((left, right) => (right.matchPercent || 0) - (left.matchPercent || 0));
      const displayArticles = hideChecked
        ? visibleArticles.filter((article) => !checklistState[wikipediaChecklistKey(article.title)])
        : visibleArticles;
      const maxScore = selection
        ? Math.max(...displayArticles.map((article) => article.filterScore || 0), 1)
        : Math.max(...displayArticles.map((article) => article.matchPercent || 0), 1);

      return {
        title: `Wikipedia Article Recommendations (${levelFiltered.length})`,
        browseHref: `${baseUrl}/wikipedia#wikipedia-library`,
        browseLabel: 'Browse all Wikipedia articles',
        toolbarLabel: `Showing ${wikipediaLevelLabel(wikiLevel)}`,
        totalCount: levelFiltered.length,
        visibleCount: displayArticles.length,
        body: displayArticles.length > 0 ? (
          <HorizontalCardScroll>
            {displayArticles.map((article) => {
              const checklistKey = wikipediaChecklistKey(article.title);
              const precision = mappingPrecisionBadge(
                classifyMappingPrecision(article.relevantPathsAI, selection?.outlinePath ?? null),
              );

              return (
                <WikipediaCard
                  key={article.title}
                  title={article.title}
                  displayTitle={article.displayTitle}
                  rationale={article.rationale}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  matchPercent={selection
                    ? Math.round(Math.min((article.filterScore || 0) / maxScore, 1) * 100)
                    : (article.matchPercent || 0)}
                  precisionLabel={precision.label}
                  precisionClassName={precision.className}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class={emptyStateClass()}>
            No Wikipedia articles matched this outline item.
          </div>
        ),
      };
    }

    if (activeType === 'iot') {
      const visibleEpisodes = selection
        ? filterEpisodesForOutline(iotEpisodes, selection)
        : [...iotEpisodes].sort((left, right) => (right.matchPercent || 0) - (left.matchPercent || 0));
      const displayEpisodes = hideChecked
        ? visibleEpisodes.filter((episode) => !checklistState[iotChecklistKey(episode.pid)])
        : visibleEpisodes;
      const maxScore = selection
        ? Math.max(...displayEpisodes.map((episode) => episode.filterScore || 0), 1)
        : Math.max(...displayEpisodes.map((episode) => episode.matchPercent || 0), 1);

      return {
        title: `BBC In Our Time Episodes (${iotEpisodes.length})`,
        browseHref: `${baseUrl}/iot#iot-library`,
        browseLabel: 'Browse all BBC In Our Time episodes',
        totalCount: iotEpisodes.length,
        visibleCount: displayEpisodes.length,
        body: displayEpisodes.length > 0 ? (
          <HorizontalCardScroll>
            {displayEpisodes.map((episode) => {
              const checklistKey = iotChecklistKey(episode.pid);
              const precision = mappingPrecisionBadge(
                classifyMappingPrecision(episode.relevantPathsAI, selection?.outlinePath ?? null),
              );

              return (
                <IotCard
                  key={episode.pid}
                  pid={episode.pid}
                  title={episode.title}
                  synopsis={episode.synopsis}
                  rationale={episode.rationale}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  matchPercent={selection
                    ? Math.round(Math.min((episode.filterScore || 0) / maxScore, 1) * 100)
                    : (episode.matchPercent || 0)}
                  precisionLabel={precision.label}
                  precisionClassName={precision.className}
                  datePublished={episode.datePublished}
                  durationSeconds={episode.durationSeconds}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class={emptyStateClass()}>
            No BBC In Our Time episodes matched this outline item.
          </div>
        ),
      };
    }

    const visibleReferences = hideChecked
      ? macropaediaReferences.filter((reference) => !checklistState[macropaediaChecklistKey(reference)])
      : macropaediaReferences;

    return {
      title: `Macropaedia Reading List (${macropaediaReferences.length})`,
      browseHref: `${baseUrl}/macropaedia#macropaedia-library`,
      browseLabel: 'Browse all Macropaedia articles',
      totalCount: macropaediaReferences.length,
      visibleCount: visibleReferences.length,
      selectionNotice: selection
        ? 'Macropaedia is mapped at section level, so topic filtering does not narrow this list.'
        : null,
      body: visibleReferences.length > 0 ? (
        <ul class="space-y-2">
          {visibleReferences.map((reference) => {
            const checklistKey = macropaediaChecklistKey(reference);
            const isChecked = Boolean(checklistState[checklistKey]);

            return (
              <li key={reference} class="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-amber-950/80">
                <a
                  href={`${baseUrl}/macropaedia/${slugify(reference)}`}
                  class={`min-w-0 flex-1 text-sm italic leading-6 transition-colors hover:text-amber-950 ${isChecked ? 'text-amber-800/40 line-through' : ''}`}
                >
                  {reference}
                </a>
                <label class="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-amber-900/70">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => {
                      writeChecklistState(checklistKey, (event.currentTarget as HTMLInputElement).checked);
                    }}
                    class="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-400"
                    aria-label={`Mark ${reference} as completed`}
                  />
                  Done
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <div class={emptyStateClass()}>
          No Macropaedia articles remain visible in this list.
        </div>
      ),
    };
  }, [
    activeType,
    baseUrl,
    checklistState,
    hideChecked,
    iotEpisodes,
    macropaediaReferences,
    sectionCode,
    sectionOutlineText,
    sectionTitle,
    selection,
    vsiMappings,
    wikiArticles,
    wikiLevel,
  ]);

  if (!availableTypes.length) return null;

  return (
    <section ref={panelRef} class="space-y-3">
      <ReadingSelectionStrip
        readingTypeValue={activeType}
        readingTypeOptions={typeOptions}
        onReadingTypeChange={(type) => {
          if (typeCounts[type] === 0) return;
          setSelectedType(type);
          setReadingPreference(type);
        }}
        readingTypeAriaLabel="Section reading type"
        supplementaryControls={(
          <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 font-medium text-slate-600 cursor-pointer select-none transition hover:border-slate-300 hover:bg-white">
            <input
              type="checkbox"
              checked={hideChecked}
              onChange={(event) => setHideCheckedReadings((event.currentTarget as HTMLInputElement).checked)}
              class="h-3.5 w-3.5 rounded border-slate-300 text-slate-700 focus:ring-slate-400"
            />
            Hide checked
          </label>
        )}
      />

      <section class={recommendationPanelClass()}>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h2 class="text-sm font-medium uppercase tracking-wide text-amber-800">
              {headerMeta.title}
            </h2>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-xs">
            {headerMeta.toolbarLabel ? (
              <span class="font-medium text-amber-900/75">
                {headerMeta.toolbarLabel}
              </span>
            ) : null}
            <a
              href={headerMeta.browseHref}
              class="font-semibold uppercase tracking-[0.18em] text-amber-900 hover:text-amber-950"
            >
              {headerMeta.browseLabel}
            </a>
          </div>
        </div>

        {selection ? (
          <div class="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white/85 px-3 py-2.5">
            <div class="min-w-0">
              <p class="text-sm font-medium text-amber-950">
                Showing {headerMeta.visibleCount} of {headerMeta.totalCount} for {selection.outlinePath}
              </p>
              <p class="mt-1 text-xs leading-5 text-amber-900/80">
                {headerMeta.selectionNotice ?? selection.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelection(null)}
              class="inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100/70"
            >
              Show all
            </button>
          </div>
        ) : null}

        <div class="mt-4">
          {headerMeta.body}
        </div>
      </section>
    </section>
  );
}
