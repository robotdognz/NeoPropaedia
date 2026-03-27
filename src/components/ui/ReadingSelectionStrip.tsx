import { h, type ComponentChildren } from 'preact';
import type { CoverageLayer } from '../../utils/readingLibrary';
import type { ReadingType } from '../../utils/readingPreference';
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
}: ReadingSelectionStripProps) {
  const showsCoverageLayer = Boolean(
    coverageLayerValue
      && coverageLayerOptions
      && onCoverageLayerChange
      && coverageLayerAriaLabel,
  );

  return (
    <section class={`${CONTROL_SURFACE_CLASS} p-2.5 sm:p-3`}>
      <div class={`grid gap-2.5 ${showsCoverageLayer ? 'lg:grid-cols-2 lg:gap-3' : ''}`}>
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
      </div>
      {supplementaryControls ? (
        <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200/80 px-0.5 pt-2 text-xs">
          {supplementaryControls}
        </div>
      ) : null}
    </section>
  );
}
