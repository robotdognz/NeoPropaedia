import { h } from 'preact';
import {
  CONTROL_FIELD_SHELL_CLASS,
  CONTROL_PANEL_PADDING_CLASS,
  CONTROL_SECTION_LABEL_CLASS,
  CONTROL_SELECT_CLASS,
  CONTROL_SELECT_ICON_CLASS,
  CONTROL_SURFACE_CLASS,
  CONTROL_TEXT_INPUT_CLASS,
} from '../ui/controlTheme';
import SelectorCardRail from '../ui/SelectorCardRail';
import type { ReadingLibraryCheckedFilter } from '../../utils/readingPreference';

interface LibraryListControlsPanelProps {
  query: string;
  onQueryInput: (value: string) => void;
  queryPlaceholder: string;
  checkedFilter: ReadingLibraryCheckedFilter;
  onCheckedFilterChange: (value: ReadingLibraryCheckedFilter) => void;
  sortField: string;
  onSortFieldChange: (value: string) => void;
  sortOptions: Array<{ value: string; label: string }>;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (value: 'asc' | 'desc') => void;
}

function SelectChevron() {
  return (
    <svg
      class={CONTROL_SELECT_ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  );
}

export default function LibraryListControlsPanel({
  query,
  onQueryInput,
  queryPlaceholder,
  checkedFilter,
  onCheckedFilterChange,
  sortField,
  onSortFieldChange,
  sortOptions,
  sortDirection,
  onSortDirectionChange,
}: LibraryListControlsPanelProps) {
  return (
    <section class={`${CONTROL_SURFACE_CLASS} ${CONTROL_PANEL_PADDING_CLASS}`}>
      <div class="grid gap-2.5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)] lg:items-start">
        <section class="min-w-0 space-y-1.5">
          <div class={CONTROL_SECTION_LABEL_CLASS}>Search</div>
          <div class={CONTROL_FIELD_SHELL_CLASS}>
            <input
              type="search"
              value={query}
              onInput={(event) => onQueryInput((event.currentTarget as HTMLInputElement).value)}
              placeholder={queryPlaceholder}
              class={CONTROL_TEXT_INPUT_CLASS}
            />
          </div>
        </section>

        <section class="min-w-0 space-y-1.5">
          <div class={CONTROL_SECTION_LABEL_CLASS}>Sort</div>
          <div class="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.76fr)_minmax(13rem,1.08fr)] xl:items-start">
            <label class="min-w-0">
              <span class={`${CONTROL_FIELD_SHELL_CLASS} relative`}>
                <select
                  value={sortField}
                  onChange={(event) => onSortFieldChange((event.currentTarget as HTMLSelectElement).value)}
                  class={CONTROL_SELECT_CLASS}
                >
                  {sortOptions.map((option) => (
                    <option value={option.value}>{option.label}</option>
                  ))}
                </select>
                <SelectChevron />
              </span>
            </label>

            <label class="min-w-0">
              <span class={`${CONTROL_FIELD_SHELL_CLASS} relative`}>
                <select
                  value={sortDirection}
                  onChange={(event) => onSortDirectionChange((event.currentTarget as HTMLSelectElement).value as 'asc' | 'desc')}
                  class={CONTROL_SELECT_CLASS}
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
                <SelectChevron />
              </span>
            </label>

            <div class="min-w-0">
              <SelectorCardRail
                ariaLabel="Checked filter"
                value={checkedFilter}
                onChange={onCheckedFilterChange}
                options={[
                  { value: 'both', label: 'All' },
                  { value: 'checked', label: 'Checked' },
                  { value: 'unchecked', label: 'Unchecked' },
                ]}
                columns={3}
                size="compact"
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
