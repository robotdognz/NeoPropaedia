import { h } from 'preact';
import type { CoverageLayer } from '../../utils/readingLibrary';
import type { ReadingType } from '../../utils/readingPreference';
import SelectorCardRail, { type SelectorCardRailOption } from './SelectorCardRail';

interface ReadingSelectionStripProps {
  readingTypeValue: ReadingType;
  readingTypeOptions: SelectorCardRailOption<ReadingType>[];
  onReadingTypeChange: (type: ReadingType) => void;
  readingTypeAriaLabel: string;
  coverageLayerValue: CoverageLayer;
  coverageLayerOptions: SelectorCardRailOption<CoverageLayer>[];
  onCoverageLayerChange: (layer: CoverageLayer) => void;
  coverageLayerAriaLabel: string;
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
}: ReadingSelectionStripProps) {
  return (
    <section class="rounded-[1.1rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] p-2.5 shadow-sm shadow-slate-200/40 sm:p-3">
      <div class="grid gap-2.5 lg:grid-cols-2 lg:gap-3">
        <SelectorCardRail
          label="Reading Type"
          ariaLabel={readingTypeAriaLabel}
          value={readingTypeValue}
          options={readingTypeOptions}
          onChange={onReadingTypeChange}
          size="compact"
        />
        <SelectorCardRail
          label="Coverage Layer"
          ariaLabel={coverageLayerAriaLabel}
          value={coverageLayerValue}
          options={coverageLayerOptions}
          onChange={onCoverageLayerChange}
          size="compact"
        />
      </div>
    </section>
  );
}
