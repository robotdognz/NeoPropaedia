import { h } from 'preact';
import {
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
  type LayerCoverageSnapshot,
} from '../../utils/readingLibrary';
import SelectorCardRail from '../ui/SelectorCardRail';

const LAYER_DESCRIPTIONS: Record<CoverageLayer, string> = {
  part: 'Build a broad foundation across the ten major fields.',
  division: 'Cover the main strands within those fields before you narrow further.',
  section: 'Reach more named topics across the outline.',
  subsection: 'Push into the top-level subsection headings inside each Section.',
};
const LAYER_ACCENT_COLORS: Record<CoverageLayer, string> = {
  part: '#6366f1',
  division: '#8b5cf6',
  section: '#a78bfa',
  subsection: '#c4b5fd',
};

interface CoverageLayerTabsProps {
  activeLayer: CoverageLayer;
  onSelect: (layer: CoverageLayer) => void;
  snapshots: Array<Pick<LayerCoverageSnapshot<ChecklistBackedReadingEntry>, 'layer' | 'currentlyCoveredCount' | 'totalCoverageCount'>>;
}

export default function CoverageLayerTabs({
  activeLayer,
  onSelect,
  snapshots,
}: CoverageLayerTabsProps) {
  const activeSnapshot = snapshots.find((snapshot) => snapshot.layer === activeLayer);
  const activeMeta = COVERAGE_LAYER_META[activeLayer];

  return (
    <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="text-sm font-medium uppercase tracking-wide text-gray-500">Outline Layer</h2>
          <p class="mt-1 text-sm text-gray-600">
            Choose which layer of the outline you want the next recommendations to maximise.
          </p>
          {activeSnapshot ? (
            <p class="mt-1.5 text-sm leading-6 text-gray-600">
              <span class="font-medium text-gray-900">{activeMeta.label} coverage:</span>{' '}
              {LAYER_DESCRIPTIONS[activeLayer]} You have covered{' '}
              {activeSnapshot.currentlyCoveredCount} of {activeSnapshot.totalCoverageCount} so far.
            </p>
          ) : null}
        </div>
      </div>
      <div class="mt-3">
        <SelectorCardRail
          ariaLabel="Coverage layer"
          value={activeLayer}
          options={snapshots.map((snapshot) => ({
            value: snapshot.layer,
            label: COVERAGE_LAYER_META[snapshot.layer].pluralLabel,
            meta: `${snapshot.currentlyCoveredCount}/${snapshot.totalCoverageCount}`,
            accentColor: LAYER_ACCENT_COLORS[snapshot.layer],
          }))}
          onChange={onSelect}
          size="compact"
        />
      </div>
    </section>
  );
}
