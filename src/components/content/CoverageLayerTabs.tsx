import { h } from 'preact';
import {
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
  type LayerCoverageSnapshot,
} from '../../utils/readingLibrary';

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
  return (
    <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="font-serif text-2xl text-gray-900">Recommendation Focus</h2>
          <p class="mt-1 text-sm text-gray-600">
            Choose which layer of the outline you want the next recommendations to maximise.
          </p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Coverage layer">
        {snapshots.map((snapshot) => {
          const isActive = snapshot.layer === activeLayer;
          const meta = COVERAGE_LAYER_META[snapshot.layer];

          return (
            <button
              key={snapshot.layer}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(snapshot.layer)}
              class={`rounded-full border px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <span class="font-medium">{meta.label}</span>
              <span class={`ml-2 text-xs ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>
                {snapshot.currentlyCoveredCount}/{snapshot.totalCoverageCount}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
