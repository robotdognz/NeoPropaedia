import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import { type WikipediaAggregateEntry } from '../../utils/readingData';
import { slugify, type PartMeta } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useReadingShelfState } from '../../hooks/useReadingShelfState';
import { useHashAnchorCorrection } from '../../hooks/useHashAnchorCorrection';
import { useReadingLibraryControlsState } from '../../hooks/useReadingLibraryControlsState';
import {
  buildCoverageRings,
  buildLayerCoverageSnapshot,
  buildPartCoverageSegments,
  completedChecklistKeysFromState,
  countEntryCoverageForLayer,
  countCompletedEntries,
  coverageLayerLabel,
  COVERAGE_LAYER_META,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import CoverageLayerTabs from './CoverageLayerTabs';
import CoverageGapPanel from './CoverageGapPanel';
import CompletedTimeStatistics from './CompletedTimeStatistics';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingActionControls from './ReadingActionControls';
import ReadingLibraryStatisticsAccordion from './ReadingLibraryStatisticsAccordion';
import SelectorCardRail from '../ui/SelectorCardRail';
import { CONTROL_SURFACE_CLASS } from '../ui/controlTheme';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';
import {
  getStoredWikipediaLevel,
  setStoredWikipediaLevel,
  subscribeWikipediaLevel,
  wikipediaLevelCount,
  wikipediaLevelName,
  type WikipediaKnowledgeLevel,
} from '../../utils/wikipediaLevel';
import {
  getCoverageLayerPreference,
  setCoverageLayerPreference,
  subscribeCoverageLayerPreference,
} from '../../utils/readingPreference';
import {
  estimateReadingMinutes,
  formatEstimatedReadingTime,
} from '../../utils/readingSpeed';

export interface WikipediaLibraryProps {
  entries: WikipediaAggregateEntry[];
  baseUrl: string;
  partsMeta?: PartMeta[];
}

type KnowledgeLevel = WikipediaKnowledgeLevel;
type SortField = 'section' | 'part' | 'division' | 'subsection' | 'title';
type SortDirection = 'asc' | 'desc';

const INITIAL_VISIBLE = 50;
const RECOMMENDATION_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};
function activeCoverageDescription(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'Parts with at least one checked article.';
    case 'division':
      return 'Divisions with at least one checked article.';
    case 'section':
      return 'Sections with at least one checked article.';
    case 'subsection':
      return 'Top-level Subsection coverage from explicit article path matches inside each Section.';
    default:
      return '';
  }
}

function precisionBadgeText(entry: WikipediaAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

export default function WikipediaLibrary({
  entries,
  baseUrl,
  partsMeta,
}: WikipediaLibraryProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const checklistState = useReadingChecklistState();
  const shelfState = useReadingShelfState();
  const {
    checkedOnly,
    shelvedOnly,
    sortField,
    sortDirection,
    setCheckedOnly,
    setShelvedOnly,
    setSortField,
    setSortDirection,
  } = useReadingLibraryControlsState<SortField>('wikipedia', 'section');
  useHashAnchorCorrection('wikipedia-library');
  const [level, setLevel] = useState<KnowledgeLevel>(3);
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const changeLayer = (layer: CoverageLayer) => {
    setSelectedLayer(layer);
    setCoverageLayerPreference(layer);
  };

  useEffect(() => {
    setLevel(getStoredWikipediaLevel());
    setSelectedLayer(getCoverageLayerPreference());
    const unsubLevel = subscribeWikipediaLevel((nextLevel) => setLevel(nextLevel));
    const unsubLayer = subscribeCoverageLayerPreference((layer) => setSelectedLayer(layer));
    return () => {
      unsubLevel();
      unsubLayer();
    };
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, checkedOnly, shelvedOnly, sortField, sortDirection, level]);

  const changeLevel = (newLevel: KnowledgeLevel) => {
    setLevel(newLevel);
    setStoredWikipediaLevel(newLevel);
  };

  const levelEntries = entries.filter((entry) => entry.lowestLevel <= level);
  const completedCount = countCompletedEntries(levelEntries, checklistState);
  const normalizedQuery = query.trim().toLowerCase();

  const {
    coverageRings,
    defaultLayer,
    layerSnapshots,
    layerTabSnapshots,
  } = useMemo(() => {
    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
    const snapshots = RECOMMENDATION_LAYERS.map((layer) => buildLayerCoverageSnapshot(levelEntries, completedChecklistKeys, layer));
    const tabSnapshots = snapshots.map((snapshot) => ({
      layer: snapshot.layer,
      currentlyCoveredCount: snapshot.currentlyCoveredCount,
      totalCoverageCount: snapshot.totalCoverageCount,
    }));

    return {
      coverageRings: buildCoverageRings(levelEntries, checklistState),
      defaultLayer: selectDefaultCoverageLayer(tabSnapshots),
      layerSnapshots: snapshots,
      layerTabSnapshots: tabSnapshots,
    };
  }, [checklistState, levelEntries]);

  const activeLayer = selectedLayer ?? defaultLayer;
  const partSegments = useMemo(() => {
    if (!partsMeta) return undefined;
    return buildPartCoverageSegments(levelEntries, checklistState, activeLayer, partsMeta);
  }, [levelEntries, checklistState, activeLayer, partsMeta]);
  const activeSnapshot = layerSnapshots.find((snapshot) => snapshot.layer === activeLayer) ?? layerSnapshots[0];
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const partSnapshot = layerSnapshots.find((snapshot) => snapshot.layer === 'part') ?? layerSnapshots[0];
  const isPartComplete = partSnapshot
    ? partSnapshot.currentlyCoveredCount >= partSnapshot.totalCoverageCount
    : false;
  const layerMeta = activeSnapshot ? COVERAGE_LAYER_META[activeSnapshot.layer] : COVERAGE_LAYER_META.section;
  const coverageCounts = useMemo(() => new Map(
    levelEntries.map((entry) => [
      entry.checklistKey,
      {
        part: countEntryCoverageForLayer(entry, 'part'),
        division: countEntryCoverageForLayer(entry, 'division'),
        section: countEntryCoverageForLayer(entry, 'section'),
        subsection: countEntryCoverageForLayer(entry, 'subsection'),
      },
    ])
  ), [levelEntries]);

  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);
  const filteredEntries = levelEntries
    .filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      const isShelved = Boolean(shelfState[entry.checklistKey]);
      if (checkedOnly && !isChecked) return false;
      if (shelvedOnly && !isShelved) return false;
      if (!normalizedQuery) return true;
      return entry.title.toLowerCase().includes(normalizedQuery) || (entry.category || '').toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => {
      switch (sortField) {
        case 'title':
          return sortDirection === 'asc' ? collate(a.title, b.title) : collate(b.title, a.title);
        default: {
          const aCount = coverageCounts.get(a.checklistKey)?.[sortField] ?? 0;
          const bCount = coverageCounts.get(b.checklistKey)?.[sortField] ?? 0;
          const primary = compareNumber(aCount, bCount);
          return primary !== 0 ? primary : collate(a.title, b.title);
        }
      }
    });

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-4">
      <section class={`${CONTROL_SURFACE_CLASS} space-y-2.5 p-2.5 sm:p-3`}>
        <CoverageLayerTabs
          activeLayer={activeLayer}
          onSelect={(layer) => changeLayer(layer)}
          snapshots={layerTabSnapshots}
          framed={false}
        />
        <SelectorCardRail
          label="Wikipedia Level"
          ariaLabel="Wikipedia level"
          value={level}
          columns={3}
          options={([1, 2, 3] as KnowledgeLevel[]).map((lvl) => ({
            value: lvl,
            label: wikipediaLevelName(lvl),
            meta: wikipediaLevelCount(lvl),
          }))}
          onChange={changeLevel}
          size="compact"
        />
      </section>

      <div class="space-y-4">
        <ReadingCoverageSummary
          coverageRings={coverageRings}
          totalLabel="Articles"
          totalCount={levelEntries.length}
          totalDescription="Wikipedia Vital Articles at the selected level."
          completedCount={completedCount}
          completedDescription="Shared with the Done boxes on section pages."
          activeCoverageLabel={`${layerMeta.label} Coverage`}
          activeRingLabel={layerMeta.pluralLabel}
          onSelectCoverageRing={(label) => {
            const layer = LAYER_BY_RING_LABEL[label];
            if (layer) changeLayer(layer);
          }}
          activeCoverageCount={activeSnapshot?.currentlyCoveredCount ?? 0}
          activeCoverageTotal={activeSnapshot?.totalCoverageCount ?? 0}
          activeCoverageDescription={activeCoverageDescription(activeLayer)}
          partSegments={partSegments}
          activeLayerLabel={coverageLayerLabel(activeLayer, 2)}
          coverageStatisticsPreface={
            <CompletedTimeStatistics
              entries={levelEntries}
              checklistState={checklistState}
              sourceLabel="Wikipedia"
              readingSpeedWpm={readingSpeedWpm}
            />
          }
          showSummaryCards={false}
        />
      </div>
      <ReadingLibraryStatisticsAccordion
        totalLabel="Articles"
        totalCount={levelEntries.length}
        totalDescription="Wikipedia Vital Articles at the selected level."
        completedCount={completedCount}
        completedDescription="Shared with the Done boxes on section pages."
        activeCoverageLabel="Part Coverage"
        activeCoverageCount={partSnapshot?.currentlyCoveredCount ?? 0}
        activeCoverageTotal={partSnapshot?.totalCoverageCount ?? 0}
        activeCoverageDescription={activeCoverageDescription('part')}
      >
        <CoverageGapPanel
          entries={levelEntries}
          checklistState={checklistState}
          activeLayer="part"
          baseUrl={baseUrl}
          itemLabelPlural="articles"
          isComplete={isPartComplete}
        />
      </ReadingLibraryStatisticsAccordion>

      <section id="wikipedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Wikipedia Article List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full Vital Articles list and sort it by coverage across Parts, Divisions, Sections, or Subsections.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              These controls only change the full article list below. The Outline Layer tabs above drive the coverage view; the statistics drawer stays focused on overall Parts coverage.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching articles
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              placeholder="Search articles..."
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <div class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Filters</span>
            <div class="flex flex-col gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 shadow-sm">
              <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={checkedOnly}
                  onChange={(event) => setCheckedOnly((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Checked only
              </label>
              <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={shelvedOnly}
                  onChange={(event) => setShelvedOnly((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Shelved only
              </label>
            </div>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Sort By</span>
            <select
              value={sortField}
              onChange={(event) => setSortField((event.currentTarget as HTMLSelectElement).value as SortField)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="part">Most Parts covered</option>
              <option value="division">Most Divisions covered</option>
              <option value="section">Most Sections covered</option>
              <option value="subsection">Most Subsections covered</option>
              <option value="title">Title</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Order</span>
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection((event.currentTarget as HTMLSelectElement).value as SortDirection)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>

        {filteredEntries.length > 0 ? (
          <>
            <div class="mt-6 space-y-4">
	              {visibleEntries.map((entry) => {
	                const isChecked = Boolean(checklistState[entry.checklistKey]);
                  const isShelved = Boolean(shelfState[entry.checklistKey]);
	                const metadata = [
	                  entry.category,
	                  entry.sectionCount > 0 ? `${entry.sectionCount} sections` : null,
	                  formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
	                ].filter(Boolean);
	                return (
	                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
	                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
	                          <a href={`${baseUrl}/wikipedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.displayTitle || entry.title}</a>
	                        </h3>
	                        {metadata.length > 0 ? (
	                          <p class="mt-1 text-sm text-gray-600">{metadata.join(' · ')}</p>
	                        ) : null}
	                      </div>
                      <ReadingActionControls
                        checked={isChecked}
                        onCheckedChange={(checked) => writeChecklistState(entry.checklistKey, checked)}
                        checkboxAriaLabel={`Mark ${entry.title} as read`}
                        shelved={isShelved}
                        onShelvedChange={(shelved) => writeShelfState(entry.checklistKey, shelved)}
                        shelfAriaLabel={`Add ${entry.title} to shelf`}
                        ribbonOffsetClass="-mt-5"
                      />
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                      <span class={`rounded-full px-2.5 py-1 ${entry.sectionCount > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                        {entry.sectionCount > 0 ? `Appears in ${entry.sectionCount} Sections` : 'No matching sections'}
                      </span>
                      {precisionBadgeText(entry) && (
                        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{precisionBadgeText(entry)}</span>
                      )}
                      {entry.category && (
                        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{entry.category}</span>
                      )}
                    </div>

                    <ReadingSectionLinks
                      sections={entry.sections}
                      baseUrl={baseUrl}
                      label={`Show all ${entry.sectionCount} Sections`}
                    />
                  </article>
                );
              })}
            </div>
            {canShowMore && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 50)}
                class="mt-6 w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Show more ({filteredEntries.length - visibleCount} remaining)
              </button>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
            {checkedOnly || shelvedOnly
              ? 'No articles matched those filters.'
              : 'No articles match your filters.'}
          </div>
        )}
      </section>
    </div>
  );
}
