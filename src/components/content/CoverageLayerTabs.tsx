import { h } from 'preact';
import {
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
  type LayerCoverageSnapshot,
} from '../../utils/readingLibrary';
import SelectorCardRail from '../ui/SelectorCardRail';
import { CONTROL_PANEL_PADDING_CLASS, CONTROL_SURFACE_CLASS } from '../ui/controlTheme';

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
  framed?: boolean;
  label?: string;
  metaTextByLayer?: Partial<Record<CoverageLayer, string>>;
}

export default function CoverageLayerTabs({
  activeLayer,
  onSelect,
  snapshots,
  framed = true,
  label = 'Coverage Layer',
  metaTextByLayer,
}: CoverageLayerTabsProps) {
  return (
    <section class={framed ? `${CONTROL_SURFACE_CLASS} ${CONTROL_PANEL_PADDING_CLASS}` : undefined}>
      <SelectorCardRail
        label={label}
        ariaLabel="Coverage layer"
        value={activeLayer}
        options={snapshots.map((snapshot) => ({
          value: snapshot.layer,
          label: COVERAGE_LAYER_META[snapshot.layer].pluralLabel,
          meta: metaTextByLayer?.[snapshot.layer] ?? `${snapshot.currentlyCoveredCount}/${snapshot.totalCoverageCount}`,
          accentColor: LAYER_ACCENT_COLORS[snapshot.layer],
        }))}
        onChange={onSelect}
        size="compact"
      />
    </section>
  );
}
