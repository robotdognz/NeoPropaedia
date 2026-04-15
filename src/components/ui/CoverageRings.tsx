import { h, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const ADDED_PREVIEW_COLOR = '#111827';

export interface CoverageRingsProps {
  rings: { label: string; count: number; addedCount?: number; total: number; color: string }[];
  size?: number;
  ringWidth?: number;
  containerClassName?: string;
  hideLegend?: boolean;
  freezeTransitions?: boolean;
  activeRingLabel?: string;
  onSelectRing?: (label: string) => void;
  centerContent?: ComponentChildren;
  overlayMode?: 'delta' | 'footprint';
}

export default function CoverageRings({
  rings,
  size = 160,
  ringWidth = 10,
  containerClassName,
  hideLegend = false,
  freezeTransitions = false,
  activeRingLabel,
  onSelectRing,
  centerContent,
  overlayMode = 'delta',
}: CoverageRingsProps) {
  const center = size / 2;
  const gap = 3;
  const activeRingWidthBoost = 3;
  const outerEdgeInset = 1;
  const ringGeometryTransition = 'r 180ms ease, stroke-width 180ms ease';
  const trackTransition = `${ringGeometryTransition}, stroke 180ms ease, stroke-opacity 180ms ease`;
  const fillTransition = 'stroke-dashoffset 0.8s ease-out, stroke-opacity 0.4s ease-out';
  const zeroFadeOutTransition = 'stroke-dashoffset 0.8s ease-out, stroke-opacity 0.4s ease-in 0.4s';
  const opacityTransition = 'stroke-opacity 0.4s ease-out';
  const arcTransition = `${fillTransition}, transform 180ms ease, ${ringGeometryTransition}`;
  const zeroFadeOutArcTransition = `${zeroFadeOutTransition}, transform 180ms ease, ${ringGeometryTransition}`;
  const zeroArcHideDelayMs = 820;
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ringFingerprint = rings.map((ring) =>
    `${ring.label}:${ring.count}+${ring.addedCount ?? 0}/${ring.total}`,
  ).join(',');
  const prevLabelRef = useRef(activeRingLabel);
  const prevFingerprintRef = useRef(ringFingerprint);
  const snapModeRef = useRef<'none' | 'geometry' | 'all'>('none');
  const [, forceRender] = useState(0);

  // Detect changes during render so the snap mode applies on the same frame.
  // Layer-only active-ring changes should snap the whole arc instantly.
  // Source switches should only snap geometry and keep fill animation enabled.
  const labelChanged = activeRingLabel !== prevLabelRef.current;
  const dataChanged = ringFingerprint !== prevFingerprintRef.current;
  if (labelChanged) {
    prevLabelRef.current = activeRingLabel;
    snapModeRef.current = dataChanged ? 'geometry' : 'all';
  }
  prevFingerprintRef.current = ringFingerprint;

  const snapMode = snapModeRef.current;
  const isSnappingGeometry = snapMode !== 'none';
  const isSnappingAll = snapMode === 'all';

  useEffect(() => {
    if (snapModeRef.current !== 'none') {
      let innerFrame = 0;
      const outerFrame = requestAnimationFrame(() => {
        innerFrame = requestAnimationFrame(() => {
          snapModeRef.current = 'none';
          forceRender(n => n + 1);
        });
      });

      return () => {
        cancelAnimationFrame(outerFrame);
        if (innerFrame) cancelAnimationFrame(innerFrame);
      };
    }
  }, [activeRingLabel, ringFingerprint]);

  // Detect rings that just appeared - suppress them for one frame so they animate from 0
  const prevRingLabelsRef = useRef<Set<string>>(new Set(rings.map(r => r.label)));
  const newRingLabelsRef = useRef<Set<string>>(new Set());
  const currentLabels = rings.map(r => r.label);
  const justAppeared = currentLabels.filter(l => !prevRingLabelsRef.current.has(l));
  if (justAppeared.length > 0) {
    newRingLabelsRef.current = new Set(justAppeared);
  }
  prevRingLabelsRef.current = new Set(currentLabels);
  useEffect(() => {
    if (newRingLabelsRef.current.size > 0) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          newRingLabelsRef.current = new Set();
          forceRender(n => n + 1);
        });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [currentLabels.join(',')]);

  // Track which rings should hide their arc (after transition to zero completes)
  // Initialize with any rings already at zero to prevent flash on mount
  const [hiddenArcs, setHiddenArcs] = useState<Set<string>>(
    () => new Set(rings.filter(r => r.total === 0 || r.count === 0).map(r => r.label))
  );
  const hideTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Trigger animation after mount - subsequent data changes
    // transition smoothly via CSS without resetting to zero
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // When a ring's fraction goes to 0, delay hiding it until the collapse and fade-out finish.
  useEffect(() => {
    rings.forEach((ring) => {
      const fraction = ring.total > 0 ? ring.count / ring.total : 0;
      const existing = hideTimers.current.get(ring.label);

      if (fraction > 0) {
        // Show immediately
        if (existing) { clearTimeout(existing); hideTimers.current.delete(ring.label); }
        setHiddenArcs((prev) => { if (!prev.has(ring.label)) return prev; const next = new Set(prev); next.delete(ring.label); return next; });
      } else if (!hiddenArcs.has(ring.label) && !existing) {
        // Hide after the zero-transition finishes so the round cap stays visible while collapsing.
        const id = window.setTimeout(() => {
          hideTimers.current.delete(ring.label);
          setHiddenArcs((prev) => new Set(prev).add(ring.label));
        }, zeroArcHideDelayMs);
        hideTimers.current.set(ring.label, id);
      }
    });
  }, [ringFingerprint]);

  useEffect(() => () => {
    hideTimers.current.forEach((timerId) => clearTimeout(timerId));
    hideTimers.current.clear();
  }, []);

  const ringWidths = rings.map((ring) =>
    ring.label === activeRingLabel ? ringWidth + activeRingWidthBoost : ringWidth
  );
  const radii: number[] = [];
  rings.forEach((_, index) => {
    if (index === 0) {
      radii.push(center - outerEdgeInset - ringWidths[index] / 2);
      return;
    }

    radii.push(
      radii[index - 1] - ringWidths[index - 1] / 2 - gap - ringWidths[index] / 2
    );
  });

  function ringLabelForPointer(clientX: number, clientY: number): string | null {
    const svg = ref.current?.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) return null;

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const localX = ((clientX - rect.left) / rect.width) * size;
    const localY = ((clientY - rect.top) / rect.height) * size;
    const distance = Math.hypot(localX - center, localY - center);

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    rings.forEach((_, index) => {
      const width = ringWidths[index];
      const radius = radii[index];
      const halfBand = width / 2 + gap / 2;
      const delta = Math.abs(distance - radius);
      if (delta <= halfBand && delta < bestDistance) {
        bestDistance = delta;
        bestIndex = index;
      }
    });

    return bestIndex >= 0 ? rings[bestIndex].label : null;
  }

  function updateSelectedRing(clientX: number, clientY: number) {
    if (!onSelectRing) return;
    const label = ringLabelForPointer(clientX, clientY);
    if (label) onSelectRing(label);
  }

  function resolveDisplayedArc(rawFraction: number, width: number, radius: number) {
    const clampedRawFraction = Math.min(1, Math.max(0, rawFraction));
    const circumference = 2 * Math.PI * radius;
    const isPartial = clampedRawFraction > 0 && clampedRawFraction < 1;
    const needsCompensation = (isPartial || clampedRawFraction === 0) && width > ringWidth;

    if (needsCompensation) {
      const baseRadius = radius + (width - ringWidth) / 2;
      const baseCircumference = 2 * Math.PI * baseRadius;
      const startCompensation = (width / 2) / circumference - (ringWidth / 2) / baseCircumference;
      const idealFraction =
        clampedRawFraction + ringWidth / baseCircumference - width / circumference;

      if (idealFraction > 0) {
        return {
          fraction: idealFraction,
          startRotation: startCompensation * 360,
        };
      }

      return {
        fraction: clampedRawFraction > 0 ? Math.max(0.001, clampedRawFraction - startCompensation) : 0,
        startRotation: startCompensation * 360,
      };
    }

    if (width > ringWidth) {
      const baseRadius = radius + (width - ringWidth) / 2;
      const baseCircumference = 2 * Math.PI * baseRadius;
      return {
        fraction: clampedRawFraction,
        startRotation: ((width / 2) / circumference - (ringWidth / 2) / baseCircumference) * 360,
      };
    }

    return {
      fraction: clampedRawFraction,
      startRotation: 0,
    };
  }

  return (
    <div ref={ref} class="flex flex-col items-center">
      <div class={`relative ${containerClassName ?? 'w-28 h-28 sm:w-32 sm:h-32'}`}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          class={`h-full w-full ${onSelectRing ? 'cursor-pointer touch-none' : ''}`}
          onPointerDown={(event) => {
            if (!onSelectRing) return;
            const target = event.currentTarget as SVGSVGElement;
            target.setPointerCapture(event.pointerId);
            updateSelectedRing(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!onSelectRing || (event.buttons & 1) !== 1) return;
            updateSelectedRing(event.clientX, event.clientY);
          }}
        >
          {rings.map((ring, i) => {
          const radius = radii[i];
          const width = ringWidths[i];
          const baseRawFraction = ring.total > 0 ? ring.count / ring.total : 0;
          const addedRawFraction = ring.total > 0 ? (ring.addedCount ?? 0) / ring.total : 0;
          const previewRawFraction = Math.min(1, baseRawFraction + addedRawFraction);
          const isActive = ring.label === activeRingLabel;
          const baseArc = resolveDisplayedArc(baseRawFraction, width, radius);
          const previewArc = resolveDisplayedArc(previewRawFraction, width, radius);
          const footprintArc = resolveDisplayedArc(addedRawFraction, width, radius);
          let fraction = baseArc.fraction;
          let previewFraction = overlayMode === 'delta' ? previewArc.fraction : footprintArc.fraction;
          const startRotation = baseArc.startRotation;
          const overlayStartRotation = overlayMode === 'delta' ? startRotation : footprintArc.startRotation;

          // New rings start at 0 for one frame so CSS transition animates them in
          if (newRingLabelsRef.current.has(ring.label)) {
            fraction = 0;
            previewFraction = 0;
          }

          const isArcHidden = hiddenArcs.has(ring.label);
          const dashoffset = isArcHidden ? 1 : (animated ? 1 - fraction : 1);
          const shouldFadeOutToZero = baseRawFraction === 0 && !isArcHidden;
          const arcOpacity = isArcHidden
            ? '0'
            : shouldFadeOutToZero
              ? '0'
              : (isActive ? '1' : '0.82');
          const arcLinecap = isArcHidden ? 'butt' : 'round';

          const previewDashoffset = animated ? 1 - previewFraction : 1;
          const showPreviewArc = addedRawFraction > 0;
          const overlayArc = showPreviewArc ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              pathLength={1}
              stroke={ADDED_PREVIEW_COLOR}
              stroke-opacity={isActive ? '0.95' : '0.82'}
              stroke-width={width}
              stroke-linecap="round"
              stroke-dasharray="1 1"
              stroke-dashoffset={previewDashoffset}
              style={{
                transform: `rotate(${-90 + overlayStartRotation}deg)`,
                transformOrigin: `${center}px ${center}px`,
                transition: freezeTransitions
                  ? 'none'
                  : isArcHidden
                    ? 'none'
                    : isSnappingAll
                      ? opacityTransition
                      : isSnappingGeometry
                        ? fillTransition
                        : arcTransition,
              }}
            />
          ) : null;

          return (
            <g key={ring.label}>
              {/* Background track */}
              <circle
                cx={center} cy={center} r={radius}
                fill="none"
                stroke={isActive ? '#cbd5e1' : '#e2e8f0'}
                stroke-opacity={isActive ? '0.78' : '0.72'}
                stroke-width={width}
                style={{
                  transition: freezeTransitions || isSnappingGeometry ? 'none' : trackTransition,
                }}
              />
              {overlayMode === 'delta' ? overlayArc : null}
              {/* Hidden arcs stay fully collapsed so they can animate back in from zero. */}
              <circle
                cx={center} cy={center} r={radius}
                fill="none"
                pathLength={1}
                stroke={ring.color}
                stroke-opacity={arcOpacity}
                stroke-width={width}
                stroke-linecap={arcLinecap}
                stroke-dasharray="1 1"
                stroke-dashoffset={dashoffset}
                style={{
                  transform: `rotate(${-90 + startRotation}deg)`,
                  transformOrigin: `${center}px ${center}px`,
                  transition: freezeTransitions
                    ? 'none'
                    : isArcHidden
                      ? 'none'
                    : isSnappingAll
                      ? opacityTransition
                      : isSnappingGeometry
                      ? fillTransition
                    : shouldFadeOutToZero
                        ? zeroFadeOutArcTransition
                        : arcTransition,
                }}
              />
              {overlayMode === 'footprint' ? overlayArc : null}
            </g>
          );
          })}
        </svg>
        {centerContent ? (
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
            {centerContent}
          </div>
        ) : null}
      </div>
      {!hideLegend && (
        <div class="mt-3 space-y-1">
          {rings.map((ring) => (
            <div
              key={ring.label}
              class={`flex items-center gap-2 text-xs ${
                ring.label === activeRingLabel ? 'font-medium text-gray-700' : 'text-gray-500'
              }`}
              onClick={() => onSelectRing?.(ring.label)}
            >
              <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ring.color }} />
              <span>
                {ring.label}: {ring.count}
                {(ring.addedCount ?? 0) > 0 ? ` + ${ring.addedCount}` : ''}
                /{ring.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
