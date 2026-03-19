import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import {
  buildWikipediaCoverageSnapshot,
  type WikipediaAggregateEntry,
} from '../../utils/readingData';
import { slugify } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import {
  buildCoverageRings,
  completedChecklistKeysFromState,
  countCompletedEntries,
} from '../../utils/readingLibrary';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSpreadPath from './ReadingSpreadPath';

export interface WikipediaLibraryProps {
  entries: WikipediaAggregateEntry[];
  baseUrl: string;
}

type KnowledgeLevel = 1 | 2 | 3;
type StatusFilter = 'all' | 'unchecked' | 'checked';
type SortMode = 'sections-desc' | 'sections-asc' | 'title-asc' | 'title-desc';

const LEVEL_KEY = 'propaedia-wiki-level';
const INITIAL_VISIBLE = 50;

function getStoredLevel(): KnowledgeLevel {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(LEVEL_KEY);
  if (stored === '1' || stored === '2' || stored === '3') {
    return Number(stored) as KnowledgeLevel;
  }
  return 3;
}

function storeLevel(level: KnowledgeLevel) {
  if (typeof window !== 'undefined') localStorage.setItem(LEVEL_KEY, String(level));
}

export default function WikipediaLibrary({ entries, baseUrl }: WikipediaLibraryProps) {
  const checklistState = useReadingChecklistState();
  const [level, setLevel] = useState<KnowledgeLevel>(3);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sections-desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setLevel(getStoredLevel());
  }, []);

  useEffect(() => { setVisibleCount(INITIAL_VISIBLE); }, [query, statusFilter, sortMode, level]);

  const changeLevel = (newLevel: KnowledgeLevel) => {
    setLevel(newLevel);
    storeLevel(newLevel);
  };

  const levelEntries = entries.filter((e) => e.lowestLevel <= level);
  const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
  const coverage = buildWikipediaCoverageSnapshot(levelEntries, completedChecklistKeys);
  const completedCount = countCompletedEntries(levelEntries, checklistState);
  const coverageRings = buildCoverageRings(levelEntries, checklistState);

  const normalizedQuery = query.trim().toLowerCase();
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  const filteredEntries = levelEntries
    .filter((e) => {
      const isChecked = Boolean(checklistState[e.checklistKey]);
      if (statusFilter === 'checked' && !isChecked) return false;
      if (statusFilter === 'unchecked' && isChecked) return false;
      if (!normalizedQuery) return true;
      return e.title.toLowerCase().includes(normalizedQuery) || (e.category || '').toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => {
      switch (sortMode) {
        case 'title-asc': return collate(a.title, b.title);
        case 'title-desc': return collate(b.title, a.title);
        case 'sections-asc': return a.sectionCount !== b.sectionCount ? a.sectionCount - b.sectionCount : collate(a.title, b.title);
        default: return a.sectionCount !== b.sectionCount ? b.sectionCount - a.sectionCount : collate(a.title, b.title);
      }
    });

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const bestNextRead = coverage.path[0] ?? null;

  return (
    <div class="space-y-8">
      {/* Level toggle */}
      <div class="flex justify-center">
        <div class="flex rounded-lg border border-gray-200 bg-white p-1">
          {([1, 2, 3] as KnowledgeLevel[]).map((lvl) => {
            const labels: Record<number, string> = { 1: 'Level 1 - 10', 2: 'Level 2 - 100', 3: 'Level 3 - ~1,000' };
            return (
              <button
                key={lvl} type="button" onClick={() => changeLevel(lvl)}
                class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${level === lvl ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {labels[lvl]}
              </button>
            );
          })}
        </div>
      </div>

      <ReadingCoverageSummary
        coverageRings={coverageRings}
        totalLabel="Articles"
        totalCount={levelEntries.length}
        totalDescription="Wikipedia Vital Articles at the selected level."
        completedCount={completedCount}
        completedDescription="Shared with the Done boxes on section pages."
        sectionCoverageCount={coverage.currentlyCoveredSections}
        sectionCoverageTotal={coverage.totalCoveredSections}
        sectionCoverageDescription="Sections covered by your checked articles."
        bestNextLabel="Best Next Read"
        bestNextHref={bestNextRead ? `${baseUrl}/wikipedia/${slugify(bestNextRead.title)}` : undefined}
        bestNextTitle={bestNextRead?.title}
        bestNextDescription={bestNextRead ? `Adds ${bestNextRead.newSectionCount} new sections, ${bestNextRead.sectionCount} total.` : undefined}
        emptyBestNextText="No unread article adds further section coverage."
      />

      <ReadingSpreadPath
        isOpen={spreadPathOpen}
        onToggleOpen={() => setSpreadPathOpen(!spreadPathOpen)}
        steps={coverage.path}
        remainingSections={coverage.remainingSections}
        checklistState={checklistState}
        onCheckedChange={writeChecklistState}
        getHref={(step) => `${baseUrl}/wikipedia/${slugify(step.title)}`}
        checkboxAriaLabel={(step) => `Mark ${step.title} as read`}
        itemSingular="article"
        itemPlural="articles"
        emptyMessage="No further spread path is available from unchecked articles."
        baseUrl={baseUrl}
        sectionLinksVariant="chips"
      />

      {/* Filters and list */}
      <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input type="search" placeholder="Search articles..." value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter((e.currentTarget as HTMLSelectElement).value as StatusFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="all">All</option>
              <option value="unchecked">Unchecked only</option>
              <option value="checked">Checked only</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Sort</span>
            <select value={sortMode} onChange={(e) => setSortMode((e.currentTarget as HTMLSelectElement).value as SortMode)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200">
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
                          <a href={`${baseUrl}/wikipedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.displayTitle || entry.title}</a>
                        </h3>
                        <p class="mt-1 text-sm text-gray-600">
                          {entry.category && <span>{entry.category}</span>}
                          {entry.category && entry.sectionCount > 0 && <span> · </span>}
                          {entry.sectionCount > 0 && <span>{entry.sectionCount} sections</span>}
                        </p>
                      </div>
                      <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                        <input type="checkbox" checked={isChecked}
                          onChange={(e) => writeChecklistState(entry.checklistKey, (e.currentTarget as HTMLInputElement).checked)}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Mark ${entry.title} as read`} />
                        Done
                      </label>
                    </div>
                    <div class="mt-3 flex items-center gap-3">
                      <a href={entry.url} target="_blank" rel="noopener noreferrer"
                        class="text-xs text-indigo-600 hover:text-indigo-800">Read on Wikipedia ↗</a>
                    </div>
                  </article>
                );
              })}
            </div>
            {canShowMore && (
              <button type="button" onClick={() => setVisibleCount((c) => c + 50)}
                class="mt-6 w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Show more ({filteredEntries.length - visibleCount} remaining)
              </button>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
            No articles match your filters.
          </div>
        )}
      </section>
    </div>
  );
}
