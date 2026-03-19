import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import {
  buildMacropaediaCoverageSnapshot,
  type MacropaediaAggregateEntry,
} from '../../utils/readingData';
import { slugify } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import {
  buildCoverageRings,
  completedChecklistKeysFromState,
  countCompletedEntries,
} from '../../utils/readingLibrary';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingSpreadPath from './ReadingSpreadPath';

export interface MacropaediaLibraryProps {
  entries: MacropaediaAggregateEntry[];
  baseUrl: string;
}

const INITIAL_VISIBLE_COUNT = 60;

type StatusFilter = 'all' | 'unchecked' | 'checked';
type SortMode = 'sections-desc' | 'sections-asc' | 'title-asc' | 'title-desc';

function matchesQuery(entry: MacropaediaAggregateEntry, query: string): boolean {
  if (!query) return true;
  return entry.title.toLowerCase().includes(query);
}

function sortEntries(entries: MacropaediaAggregateEntry[], sortMode: SortMode): MacropaediaAggregateEntry[] {
  const nextEntries = [...entries];
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  switch (sortMode) {
    case 'title-asc':
      nextEntries.sort((a, b) => collate(a.title, b.title));
      break;
    case 'title-desc':
      nextEntries.sort((a, b) => collate(b.title, a.title));
      break;
    case 'sections-asc':
      nextEntries.sort((a, b) => a.sectionCount !== b.sectionCount ? a.sectionCount - b.sectionCount : collate(a.title, b.title));
      break;
    default: // sections-desc
      nextEntries.sort((a, b) => a.sectionCount !== b.sectionCount ? b.sectionCount - a.sectionCount : collate(a.title, b.title));
      break;
  }
  return nextEntries;
}

export default function MacropaediaLibrary({ entries, baseUrl }: MacropaediaLibraryProps) {
  const checklistState = useReadingChecklistState();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sections-desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, statusFilter, sortMode]);

  const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
  const coverage = buildMacropaediaCoverageSnapshot(entries, completedChecklistKeys);
  const completedCount = countCompletedEntries(entries, checklistState);
  const coverageRings = buildCoverageRings(entries, checklistState);
  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (statusFilter === 'checked' && !isChecked) return false;
      if (statusFilter === 'unchecked' && isChecked) return false;
      return matchesQuery(entry, query.trim().toLowerCase());
    }),
    sortMode
  );
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const bestNextArticle = coverage.path[0] ?? null;

  return (
    <div class="space-y-8">
      <ReadingCoverageSummary
        coverageRings={coverageRings}
        totalLabel="Articles"
        totalCount={entries.length}
        totalDescription="Unique Macropaedia titles referenced in the outline."
        completedCount={completedCount}
        completedDescription="Uses the same checklist state as the section reading boxes."
        sectionCoverageCount={coverage.currentlyCoveredSections}
        sectionCoverageTotal={coverage.totalCoveredSections}
        sectionCoverageDescription="Sections with at least one article covered by your checked list."
        bestNextLabel="Best Next Article"
        bestNextHref={bestNextArticle ? `${baseUrl}/macropaedia/${slugify(bestNextArticle.title)}` : undefined}
        bestNextTitle={bestNextArticle?.title}
        bestNextDescription={bestNextArticle ? `Adds ${bestNextArticle.newSectionCount} new sections, ${bestNextArticle.sectionCount} total.` : undefined}
        emptyBestNextText="No unread article adds any further section coverage right now."
      />

      <ReadingSpreadPath
        isOpen={spreadPathOpen}
        onToggleOpen={() => setSpreadPathOpen(!spreadPathOpen)}
        steps={coverage.path}
        remainingSections={coverage.remainingSections}
        checklistState={checklistState}
        onCheckedChange={writeChecklistState}
        getHref={(step) => `${baseUrl}/macropaedia/${slugify(step.title)}`}
        checkboxAriaLabel={(step) => `Mark ${step.title} as completed`}
        itemSingular="article"
        itemPlural="articles"
        emptyMessage="No further spread path is available from unchecked articles. Either you have already covered every mapped section, or the remaining unread articles only overlap with sections already covered."
        baseUrl={baseUrl}
      />

      <section class="rounded-2xl border border-gray-200 bg-white p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Macropaedia Article List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full historical Macropaedia list and sort it by how widely it appears across the outline.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching articles
          </div>
        </div>

        <div class="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
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

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter((event.currentTarget as HTMLSelectElement).value as StatusFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">All articles</option>
              <option value="unchecked">Unchecked only</option>
              <option value="checked">Checked only</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Sort</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode((event.currentTarget as HTMLSelectElement).value as SortMode)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="sections-desc">Most sections first</option>
              <option value="sections-asc">Fewest sections first</option>
              <option value="title-asc">Title A → Z</option>
              <option value="title-desc">Title Z → A</option>
            </select>
          </label>
        </div>

        {filteredEntries.length > 0 ? (
          <>
            <div class="mt-6 space-y-4">
              {visibleEntries.map((entry) => {
                const isChecked = Boolean(checklistState[entry.checklistKey]);

                return (
                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
                          <a href={`${baseUrl}/macropaedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-3 text-xs font-medium text-gray-700">
                          Appears in {entry.sectionCount} section{entry.sectionCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            writeChecklistState(
                              entry.checklistKey,
                              (event.currentTarget as HTMLInputElement).checked
                            );
                          }}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Mark ${entry.title} as completed`}
                        />
                        Done
                      </label>
                    </div>

                    <ReadingSectionLinks
                      sections={entry.sections}
                      baseUrl={baseUrl}
                      label={`Show all ${entry.sectionCount} sections`}
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
            No Macropaedia articles matched that search.
          </div>
        )}
      </section>
    </div>
  );
}
