import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import { type MacropaediaAggregateEntry } from '../../utils/readingData';
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
import {
  BRITANNICA_TIME_UNAVAILABLE_MESSAGE,
  default as CompletedTimeStatistics,
} from './CompletedTimeStatistics';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingActionControls from './ReadingActionControls';
import ReadingLibraryStatisticsAccordion from './ReadingLibraryStatisticsAccordion';
import {
  getCoverageLayerPreference,
  setCoverageLayerPreference,
  subscribeCoverageLayerPreference,
} from '../../utils/readingPreference';

export interface MacropaediaLibraryProps {
  entries: MacropaediaAggregateEntry[];
  baseUrl: string;
  partsMeta?: PartMeta[];
}

const INITIAL_VISIBLE_COUNT = 60;
const RECOMMENDATION_LAYERS: CoverageLayer[] = ['part', 'division', 'section'];
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
};

type SortField = 'section' | 'part' | 'division' | 'title';
type SortDirection = 'asc' | 'desc';

function matchesQuery(entry: MacropaediaAggregateEntry, query: string): boolean {
  if (!query) return true;
  return entry.title.toLowerCase().includes(query);
}

function sortEntries(
  entries: MacropaediaAggregateEntry[],
  sortField: SortField,
  sortDirection: SortDirection,
  coverageCounts: Map<string, Record<'part' | 'division' | 'section', number>>
): MacropaediaAggregateEntry[] {
  const nextEntries = [...entries];
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);

  nextEntries.sort((a, b) => {
    if (sortField === 'title') {
      return sortDirection === 'asc' ? collate(a.title, b.title) : collate(b.title, a.title);
    }

    const aCount = coverageCounts.get(a.checklistKey)?.[sortField] ?? 0;
    const bCount = coverageCounts.get(b.checklistKey)?.[sortField] ?? 0;
    const primary = compareNumber(aCount, bCount);
    return primary !== 0 ? primary : collate(a.title, b.title);
  });

  return nextEntries;
}

function activeCoverageDescription(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'Parts with at least one Macropaedia article covered by your checked list.';
    case 'division':
      return 'Divisions with at least one Macropaedia article covered by your checked list.';
    case 'section':
      return 'Sections with at least one Macropaedia article covered by your checked list.';
    case 'subsection':
      return 'Approximate subsection coverage, based on mapped outline items reached by your checked articles.';
    default:
      return '';
  }
}

export default function MacropaediaLibrary({
  entries,
  baseUrl,
  partsMeta,
}: MacropaediaLibraryProps) {
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
  } = useReadingLibraryControlsState<SortField>('macropaedia', 'section');
  useHashAnchorCorrection('macropaedia-library');
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const changeLayer = (layer: CoverageLayer) => {
    setSelectedLayer(layer);
    setCoverageLayerPreference(layer);
  };

  useEffect(() => {
    setSelectedLayer(getCoverageLayerPreference());
    const unsubLayer = subscribeCoverageLayerPreference((layer) => setSelectedLayer(layer));
    return () => {
      unsubLayer();
    };
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, checkedOnly, shelvedOnly, sortField, sortDirection]);

  const completedCount = countCompletedEntries(entries, checklistState);

  const {
    coverageRings,
    defaultLayer,
    layerSnapshots,
    layerTabSnapshots,
  } = useMemo(() => {
    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
    const snapshots = RECOMMENDATION_LAYERS.map((layer) => buildLayerCoverageSnapshot(entries, completedChecklistKeys, layer));
    const tabSnapshots = snapshots.map((snapshot) => ({
      layer: snapshot.layer,
      currentlyCoveredCount: snapshot.currentlyCoveredCount,
      totalCoverageCount: snapshot.totalCoverageCount,
    }));

    return {
      coverageRings: buildCoverageRings(entries, checklistState, {
        includeSubsections: false,
      }),
      defaultLayer: selectDefaultCoverageLayer(tabSnapshots),
      layerSnapshots: snapshots,
      layerTabSnapshots: tabSnapshots,
    };
  }, [checklistState, entries]);

  const activeLayer = selectedLayer
    ? RECOMMENDATION_LAYERS.includes(selectedLayer)
      ? selectedLayer
      : selectedLayer === 'subsection' ? 'section' : defaultLayer
    : defaultLayer;
  const partSegments = useMemo(() => {
    if (!partsMeta) return undefined;
    return buildPartCoverageSegments(entries, checklistState, activeLayer, partsMeta);
  }, [entries, checklistState, activeLayer, partsMeta]);
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
    entries.map((entry) => [
      entry.checklistKey,
      {
        part: countEntryCoverageForLayer(entry, 'part'),
        division: countEntryCoverageForLayer(entry, 'division'),
        section: countEntryCoverageForLayer(entry, 'section'),
      },
    ])
  ), [entries]);

  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      const isShelved = Boolean(shelfState[entry.checklistKey]);

      if (checkedOnly && !isChecked) return false;
      if (shelvedOnly && !isShelved) return false;
      return matchesQuery(entry, query.trim().toLowerCase());
    }),
    sortField,
    sortDirection,
    coverageCounts
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-4">
      <CoverageLayerTabs
        activeLayer={activeLayer}
        onSelect={(layer) => changeLayer(layer)}
        snapshots={layerTabSnapshots}
      />

      <div class="space-y-4">
        <ReadingCoverageSummary
          coverageRings={coverageRings}
          totalLabel="Articles"
          totalCount={entries.length}
          totalDescription="Unique Macropaedia titles referenced in the outline."
          completedCount={completedCount}
          completedDescription="Uses the same checklist state as the section reading boxes."
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
              entries={entries}
              checklistState={checklistState}
              sourceLabel="Britannica"
              unsupportedMessage={BRITANNICA_TIME_UNAVAILABLE_MESSAGE}
            />
          }
          showSummaryCards={false}
        />
      </div>
      <ReadingLibraryStatisticsAccordion
        totalLabel="Articles"
        totalCount={entries.length}
        totalDescription="Unique Macropaedia titles referenced in the outline."
        completedCount={completedCount}
        completedDescription="Uses the same checklist state as the section reading boxes."
        activeCoverageLabel="Part Coverage"
        activeCoverageCount={partSnapshot?.currentlyCoveredCount ?? 0}
        activeCoverageTotal={partSnapshot?.totalCoverageCount ?? 0}
        activeCoverageDescription={activeCoverageDescription('part')}
      >
        <CoverageGapPanel
          entries={entries}
          checklistState={checklistState}
          activeLayer="part"
          baseUrl={baseUrl}
          itemLabelPlural="articles"
          isComplete={isPartComplete}
        />
      </ReadingLibraryStatisticsAccordion>

      <section id="macropaedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Macropaedia Article List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full historical Macropaedia list and sort it by coverage across Parts, Divisions, or Sections.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              These controls only change the full article list below. The Outline Layer tabs above drive the coverage view; the statistics drawer stays focused on overall Parts coverage.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching articles
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_180px]">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              placeholder="Article title"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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

                return (
                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
                          <a href={`${baseUrl}/macropaedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-3 text-xs font-medium text-gray-700">
                          Appears in {entry.sectionCount} Section{entry.sectionCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <ReadingActionControls
                        checked={isChecked}
                        onCheckedChange={(checked) => writeChecklistState(entry.checklistKey, checked)}
                        checkboxAriaLabel={`Mark ${entry.title} as completed`}
                        shelved={isShelved}
                        onShelvedChange={(shelved) => writeShelfState(entry.checklistKey, shelved)}
                        shelfAriaLabel={`Add ${entry.title} to shelf`}
                        ribbonOffsetClass="-mt-5"
                      />
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
              <div class="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE_COUNT)}
                  class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  Show 60 more
                </button>
              </div>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
            {checkedOnly || shelvedOnly
              ? 'No Britannica articles matched those filters.'
              : 'No Macropaedia articles matched that search.'}
          </div>
        )}
      </section>
    </div>
  );
}
