import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { writeChecklistState } from '../../utils/readingChecklist';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import {
  getReadingPreference,
  READING_TYPE_LABELS,
  setReadingPreference,
  subscribeReadingPreference,
  type ReadingType,
} from '../../utils/readingPreference';
import {
  buildCoverageRings,
  buildLayerCoverageSnapshot,
  completedChecklistKeysFromState,
  countCompletedEntries,
  coverageLayerLabel,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import CoverageLayerTabs from './CoverageLayerTabs';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSpreadPath from './ReadingSpreadPath';

interface HomepageCoverageExplorerProps {
  baseUrl: string;
  initialSource: HomepageCoverageSource;
}

const SOURCE_ORDER: ReadingType[] = ['vsi', 'iot', 'wikipedia', 'macropaedia'];
const ALL_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];

function availableLayers(source: HomepageCoverageSource): CoverageLayer[] {
  return source.includeSubsections ? ALL_LAYERS : ALL_LAYERS.filter((layer) => layer !== 'subsection');
}

function emptyRecommendationMessage(source: HomepageCoverageSource, layer: CoverageLayer, isComplete: boolean): string {
  const label = coverageLayerLabel(layer, 2, { lowercase: true });
  if (isComplete) {
    return `You have already covered every mapped ${label} in this view.`;
  }

  return `No unread ${source.itemSingular} adds any further ${label} right now.`;
}

export default function HomepageCoverageExplorer({
  baseUrl,
  initialSource,
}: HomepageCoverageExplorerProps) {
  const checklistState = useReadingChecklistState();
  const [selectedType, setSelectedType] = useState<ReadingType>(initialSource.type);
  const [sourceCache, setSourceCache] = useState<Partial<Record<ReadingType, HomepageCoverageSource>>>({
    [initialSource.type]: initialSource,
  });
  const [selectedLayers, setSelectedLayers] = useState<Partial<Record<ReadingType, CoverageLayer>>>({});
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<ReadingType | null>(null);
  const [errorType, setErrorType] = useState<ReadingType | null>(null);

  async function ensureSourceLoaded(type: ReadingType) {
    if (sourceCache[type]) return;

    setLoadingType(type);
    setErrorType(null);
    try {
      const response = await fetch(`${baseUrl}/home-coverage/${type}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${type}`);
      }
      const source = await response.json() as HomepageCoverageSource;
      setSourceCache((current) => ({
        ...current,
        [type]: source,
      }));
    } catch {
      setErrorType(type);
    } finally {
      setLoadingType((current) => (current === type ? null : current));
    }
  }

  useEffect(() => {
    const preferred = getReadingPreference();
    setSelectedType(preferred);
    void ensureSourceLoaded(preferred);

    return subscribeReadingPreference((type) => {
      setSelectedType(type);
      void ensureSourceLoaded(type);
    });
  }, []);

  const source = sourceCache[selectedType];
  const completedChecklistKeys = useMemo(
    () => completedChecklistKeysFromState(checklistState),
    [checklistState],
  );

  const supportedLayers = source ? availableLayers(source) : ['part', 'division', 'section'];
  const snapshots = useMemo(() => {
    if (!source) return [];
    return supportedLayers.map((layer) =>
      buildLayerCoverageSnapshot(source.entries, completedChecklistKeys, layer, {
        outlineItemCounts: source.outlineItemCounts,
      }),
    );
  }, [completedChecklistKeys, source, supportedLayers]);

  const tabSnapshots = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        layer: snapshot.layer,
        currentlyCoveredCount: snapshot.currentlyCoveredCount,
        totalCoverageCount: snapshot.totalCoverageCount,
      })),
    [snapshots],
  );

  const defaultLayer = useMemo(
    () => selectDefaultCoverageLayer(tabSnapshots),
    [tabSnapshots],
  );

  const explicitLayer = source ? selectedLayers[selectedType] : null;
  const activeLayer =
    source && explicitLayer && supportedLayers.includes(explicitLayer)
      ? explicitLayer
      : defaultLayer;
  const activeSnapshot = snapshots.find((snapshot) => snapshot.layer === activeLayer) ?? snapshots[0];
  const activePath = activeSnapshot
    ? activeSnapshot.path.map(({ entry, ...rest }) => ({
        ...entry,
        ...rest,
      }))
    : [];
  const bestNext = activePath[0] ?? null;
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const coverageRings = useMemo(() => {
    if (!source) return [];
    return buildCoverageRings(source.entries, checklistState, {
      outlineItemCounts: source.outlineItemCounts,
      totalOutlineItems: source.totalOutlineItems,
      includeSubsections: source.includeSubsections,
    });
  }, [checklistState, source]);
  const completedCount = source ? countCompletedEntries(source.entries, checklistState) : 0;

  return (
    <section
      id="whole-outline-reading-paths"
      class="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7"
    >
      <div class="space-y-5 border-b border-slate-200 pb-6">
        <div class="max-w-3xl space-y-2">
          <p class="text-sm font-sans font-semibold uppercase tracking-[0.2em] text-slate-500">
            Whole Outline
          </p>
          <h2 class="text-3xl font-serif font-bold text-slate-900">
            Coverage-First Reading Paths
          </h2>
        </div>

        <div class="space-y-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Reading List
          </p>
          <div class="flex flex-wrap gap-2">
            {SOURCE_ORDER.map((type) => {
              const isActive = type === selectedType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    setReadingPreference(type);
                    void ensureSourceLoaded(type);
                  }}
                  class={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {READING_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {errorType === selectedType ? (
        <div class="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
          Could not load the {READING_TYPE_LABELS[selectedType]} coverage data right now.
        </div>
      ) : null}

      {!source && loadingType === selectedType ? (
        <div class="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          Loading the {READING_TYPE_LABELS[selectedType]} coverage path...
        </div>
      ) : source ? (
        <div class="mt-6 space-y-6">
          <CoverageLayerTabs
            activeLayer={activeLayer}
            onSelect={(layer) => {
              setSelectedLayers((current) => ({
                ...current,
                [selectedType]: layer,
              }));
            }}
            snapshots={tabSnapshots}
          />

          <ReadingCoverageSummary
            coverageRings={coverageRings}
            totalLabel={source.totalLabel}
            totalCount={source.entries.length}
            totalDescription={source.totalDescription}
            completedCount={completedCount}
            completedDescription={source.completedDescription}
            activeCoverageLabel={`${coverageLayerLabel(activeLayer, 1)} Coverage`}
            activeCoverageCount={activeSnapshot?.currentlyCoveredCount ?? 0}
            activeCoverageTotal={activeSnapshot?.totalCoverageCount ?? 0}
            activeCoverageDescription={source.activeCoverageDescriptions[activeLayer] ?? ''}
            bestNextLabel={`Best Next for ${coverageLayerLabel(activeLayer, 1)} Coverage`}
            bestNextHref={bestNext?.href}
            bestNextTitle={bestNext?.title}
            bestNextSubtitle={bestNext?.meta}
            bestNextDescription={
              bestNext
                ? `Adds ${bestNext.newCoverageCount} new ${coverageLayerLabel(activeLayer, bestNext.newCoverageCount)}, ${bestNext.sectionCount} linked Sections.`
                : undefined
            }
            emptyBestNextText={emptyRecommendationMessage(source, activeLayer, isLayerComplete)}
          />

          <ReadingSpreadPath
            isOpen={spreadPathOpen}
            onToggleOpen={() => setSpreadPathOpen((current) => !current)}
            steps={activePath}
            remainingCoverageCount={activeSnapshot?.remainingCoverageCount ?? 0}
            checklistState={checklistState}
            onCheckedChange={writeChecklistState}
            getHref={(step) => step.href}
            renderMeta={(step) =>
              step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null
            }
            checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
            itemSingular={source.itemSingular}
            itemPlural={source.itemPlural}
            coverageUnitSingular={coverageLayerLabel(activeLayer, 1)}
            coverageUnitPlural={coverageLayerLabel(activeLayer, 2)}
            emptyMessage={emptyRecommendationMessage(source, activeLayer, isLayerComplete)}
            baseUrl={baseUrl}
            sectionLinksVariant="chips"
          />
        </div>
      ) : null}
    </section>
  );
}
