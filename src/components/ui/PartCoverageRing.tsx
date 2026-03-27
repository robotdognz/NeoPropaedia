import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PartCoverageSegment } from '../../utils/readingLibrary';
import { roundedDonutSlicePath } from '../../utils/donutPaths';

export interface PartCoverageRingProps {
  segments: PartCoverageSegment[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  gapPx?: number;
  freezeTransitions?: boolean;
}

let idCounter = 0;

export default function PartCoverageRing({
  segments,
  size = 100,
  innerRadius,
  outerRadius,
  gapPx = 2.5,
  freezeTransitions = false,
}: PartCoverageRingProps) {
  const [animated, setAnimated] = useState(false);
  const [clipId] = useState(() => `pcr-${++idCounter}`);

  const cx = size / 2;
  const cy = size / 2;
  const oR = outerRadius ?? size / 2 - 1;
  const iR = innerRadius ?? oR * 0.55;
  const segmentCount = segments.length || 10;
  const segDeg = 360 / segmentCount;

  useEffect(() => {
    // Trigger animation after mount — subsequent data changes
    // transition smoothly via CSS without resetting to zero
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} class="w-28 h-28 sm:w-32 sm:h-32">
      <defs>
        {segments.map((seg, i) => {
          const fillR = animated ? iR + seg.fraction * (oR - iR) : iR;
          return (
            <clipPath key={i} id={`${clipId}-${i}`}>
              <circle
                cx={cx}
                cy={cy}
                r={fillR}
                style={{
                  transition: freezeTransitions ? 'none' : 'r 0.8s ease-out',
                }}
              />
            </clipPath>
          );
        })}
      </defs>

      {segments.map((seg, i) => {
        const centerDeg = i * segDeg;
        const segPath = roundedDonutSlicePath(
          cx,
          cy,
          iR,
          oR,
          centerDeg - segDeg / 2,
          centerDeg + segDeg / 2,
          {
            gapPx,
            cornerRadiusPx: 2,
          }
        );

        return (
          <g key={seg.partNumber}>
            {/* Background track — rounded, low opacity */}
            <path
              d={segPath}
              fill={seg.colorHex}
              fill-opacity="0.14"
            />
            {/* Fill — same shape, clipped by expanding circle from center */}
            <path
              d={segPath}
              fill={seg.colorHex}
              fill-opacity="0.85"
              clip-path={`url(#${clipId}-${i})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
