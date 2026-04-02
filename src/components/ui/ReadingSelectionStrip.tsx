import { h, type ComponentChildren } from 'preact';
import type { CoverageLayer } from '../../utils/readingLibrary';
import type { ReadingType } from '../../utils/readingPreference';
import {
  setStoredWikipediaLevel,
  wikipediaLevelCount,
  wikipediaLevelName,
} from '../../utils/wikipediaLevel';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
import SelectorCardRail, { type SelectorCardRailOption } from './SelectorCardRail';
import { CONTROL_SURFACE_CLASS } from './controlTheme';

interface ReadingSelectionStripProps {
  readingTypeValue: ReadingType;
  readingTypeOptions: SelectorCardRailOption<ReadingType>[];
  onReadingTypeChange: (type: ReadingType) => void;
  readingTypeAriaLabel: string;
  coverageLayerValue?: CoverageLayer;
  coverageLayerOptions?: SelectorCardRailOption<CoverageLayer>[];
  onCoverageLayerChange?: (layer: CoverageLayer) => void;
  coverageLayerAriaLabel?: string;
  supplementaryControls?: ComponentChildren;
  showWikipediaLevelSelector?: boolean;
}

export default function ReadingSelectionStrip({
  readingTypeValue,
  readingTypeOptions,
  onReadingTypeChange,
  readingTypeAriaLabel,
  coverageLayerValue,
  coverageLayerOptions,
  onCoverageLayerChange,
  coverageLayerAriaLabel,
  supplementaryControls,
  showWikipediaLevelSelector = false,
}: ReadingSelectionStripProps) {
  const wikiLevel = useWikipediaLevel();
  const showsCoverageLayer = Boolean(
    coverageLayerValue
      && coverageLayerOptions
      && onCoverageLayerChange
      && coverageLayerAriaLabel,
  );
  const showsWikipediaLevel = showWikipediaLevelSelector && readingTypeValue === 'wikipedia';
  const controlCount = 1 + (showsCoverageLayer ? 1 : 0) + (showsWikipediaLevel ? 1 : 0);
  const gridClass = controlCount >= 3
    ? 'sm:grid-cols-2 xl:grid-cols-3'
    : controlCount === 2
      ? 'sm:grid-cols-2'
      : '';

  return (
    <section class={`${CONTROL_SURFACE_CLASS} p-2.5 sm:p-3`}>
      <div class={`grid gap-2.5 ${gridClass}`}>
        <SelectorCardRail
          label="Reading Type"
          ariaLabel={readingTypeAriaLabel}
          value={readingTypeValue}
          options={readingTypeOptions}
          onChange={onReadingTypeChange}
          size="compact"
        />
        {showsCoverageLayer ? (
          <SelectorCardRail
            label="Coverage Layer"
            ariaLabel={coverageLayerAriaLabel!}
            value={coverageLayerValue!}
            options={coverageLayerOptions!}
            onChange={onCoverageLayerChange!}
            size="compact"
          />
        ) : null}
        {showsWikipediaLevel ? (
          <SelectorCardRail
            label="Wikipedia Level"
            ariaLabel="Wikipedia article level"
            value={wikiLevel}
            options={([1, 2, 3] as const).map((level) => ({
              value: level,
              label: wikipediaLevelName(level),
              meta: wikipediaLevelCount(level),
            }))}
            onChange={(level) => setStoredWikipediaLevel(level)}
            size="compact"
            columns={3}
          />
        ) : null}
      </div>
      {supplementaryControls ? (
        <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200/80 px-0.5 pt-2 text-xs">
          {supplementaryControls}
        </div>
      ) : null}
    </section>
  );
}
