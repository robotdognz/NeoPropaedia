import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import {
  buildVsiCoverageSnapshot,
  formatEditionLabel,
  type VsiAggregateEntry,
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

export interface VsiLibraryProps {
  entries: VsiAggregateEntry[];
  baseUrl: string;
  outlineItemCounts?: Record<string, number>;
  totalOutlineItems?: number;
}

const INITIAL_VISIBLE_COUNT = 50;

type StatusFilter = 'all' | 'unchecked' | 'checked';
type SortMode = 'sections-desc' | 'sections-asc' | 'title-asc' | 'title-desc' | 'number-asc' | 'number-desc';

function matchesQuery(entry: VsiAggregateEntry, query: string): boolean {
  if (!query) return true;

  const haystack = [
    entry.title,
    entry.author,
    entry.subject ?? '',
    entry.number ? String(entry.number) : '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function formatMetadata(entry: VsiAggregateEntry): string {
  const editionLabel = formatEditionLabel(entry.edition);
  return [
    entry.author,
    entry.number ? `No. ${entry.number}` : null,
    entry.subject ?? null,
    editionLabel,
    entry.publicationYear ? String(entry.publicationYear) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function sortEntries(entries: VsiAggregateEntry[], sortMode: SortMode): VsiAggregateEntry[] {
  const nextEntries = [...entries];
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  switch (sortMode) {
    case 'title-asc':
      nextEntries.sort((a, b) => collate(a.title, b.title));
      break;
    case 'title-desc':
      nextEntries.sort((a, b) => collate(b.title, a.title));
      break;
    case 'number-asc':
      nextEntries.sort((a, b) => {
        const an = a.number ?? Number.MAX_SAFE_INTEGER;
        const bn = b.number ?? Number.MAX_SAFE_INTEGER;
        return an !== bn ? an - bn : collate(a.title, b.title);
      });
      break;
    case 'number-desc':
      nextEntries.sort((a, b) => {
        const an = a.number ?? 0;
        const bn = b.number ?? 0;
        return an !== bn ? bn - an : collate(a.title, b.title);
      });
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

export default function VsiLibrary({ entries, baseUrl, outlineItemCounts, totalOutlineItems }: VsiLibraryProps) {
  const checklistState = useReadingChecklistState();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sections-desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, statusFilter, sortMode]);

  const normalizedQuery = query.trim().toLowerCase();
  const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
  const coverage = buildVsiCoverageSnapshot(entries, completedChecklistKeys);
  const completedCount = countCompletedEntries(entries, checklistState);
  const coverageRings = buildCoverageRings(entries, checklistState, {
    outlineItemCounts,
    totalOutlineItems,
  });

  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (statusFilter === 'checked' && !isChecked) return false;
      if (statusFilter === 'unchecked' && isChecked) return false;
      return matchesQuery(entry, normalizedQuery);
    }),
    sortMode
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const bestNextRead = coverage.path[0] ?? null;

  return (
    <div class="space-y-8">
      <ReadingCoverageSummary
        coverageRings={coverageRings}
        totalLabel="Titles"
        totalCount={entries.length}
        totalDescription="Unique Oxford Very Short Introductions in the mapped reading list."
        completedCount={completedCount}
        completedDescription="Shared with the Done boxes on section pages."
        sectionCoverageCount={coverage.currentlyCoveredSections}
        sectionCoverageTotal={coverage.totalCoveredSections}
        sectionCoverageDescription="Sections with at least one VSI covered by your checked titles."
        bestNextLabel="Best Next Read"
        bestNextHref={bestNextRead ? `${baseUrl}/vsi/${slugify(bestNextRead.title)}` : undefined}
        bestNextTitle={bestNextRead?.title}
        bestNextSubtitle={bestNextRead?.author}
        bestNextDescription={bestNextRead ? `Adds ${bestNextRead.newSectionCount} new sections, ${bestNextRead.sectionCount} total.` : undefined}
        emptyBestNextText="No unread VSI adds any further section coverage right now."
        mobileRingWidth={7}
        desktopRingWidth={9}
      />

      <ReadingSpreadPath
        isOpen={spreadPathOpen}
        onToggleOpen={() => setSpreadPathOpen(!spreadPathOpen)}
        steps={coverage.path}
        remainingSections={coverage.remainingSections}
        checklistState={checklistState}
        onCheckedChange={writeChecklistState}
        getHref={(step) => `${baseUrl}/vsi/${slugify(step.title)}`}
        renderMeta={(step) => <p class="mt-1 text-sm text-gray-600">{formatMetadata(step)}</p>}
        checkboxAriaLabel={(step) => `Mark ${step.title} by ${step.author} as completed`}
        itemSingular="book"
        itemPlural="books"
        emptyMessage="No further spread path is available from unchecked titles. Either you have already covered every mapped section, or the remaining unread books only overlap with sections already covered."
        baseUrl={baseUrl}
      />

      <section class="rounded-2xl border border-gray-200 bg-white p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">VSI Library</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full mapped VSI list and sort it by section spread, title, or series number.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching titles
          </div>
        </div>

        <div class="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              placeholder="Title, author, subject, or series number"
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
              <option value="all">All titles</option>
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
              <option value="number-asc">Series number (oldest)</option>
              <option value="number-desc">Series number (newest)</option>
            </select>
          </label>
        </div>

        {filteredEntries.length > 0 ? (
          <>
            <div class="mt-6 space-y-4">
              {visibleEntries.map((entry) => {
                const isChecked = Boolean(checklistState[entry.checklistKey]);
                const metadata = formatMetadata(entry);

                return (
                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
                          <a href={`${baseUrl}/vsi/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-1 text-sm text-gray-600">{metadata}</p>
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
                          aria-label={`Mark ${entry.title} by ${entry.author} as completed`}
                        />
                        Done
                      </label>
                    </div>

                    <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                      <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                        Appears in {entry.sectionCount} sections
                      </span>
                      {entry.subject && (
                        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{entry.subject}</span>
                      )}
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
                  Show 50 more
                </button>
              </div>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
            No VSI titles matched that search.
          </div>
        )}
      </section>
    </div>
  );
}
