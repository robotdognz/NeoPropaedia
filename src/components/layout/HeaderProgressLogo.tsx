import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { roundedDonutSlicePath } from '../../utils/donutPaths';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import { partColorHex } from '../../utils/helpers';
import { buildPartCoverageSegments, type PartCoverageSegment } from '../../utils/readingLibrary';
import { readChecklistState, subscribeChecklistState } from '../../utils/readingChecklist';

interface HeaderProgressLogoProps {
  baseUrl: string;
  size?: number;
}

const PART_TITLES = [
  'Matter and Energy',
  'The Earth',
  'Life on Earth',
  'Human Life',
  'Human Society',
  'Art',
  'Technology',
  'Religion',
  'The History of Mankind',
  'The Branches of Knowledge',
];

const PARTS_META = PART_TITLES.map((title, index) => ({
  partNumber: index + 1,
  colorHex: partColorHex(index + 1),
  title,
}));

const FALLBACK_SEGMENTS: PartCoverageSegment[] = PARTS_META.map((part) => ({
  partNumber: part.partNumber,
  colorHex: part.colorHex,
  title: part.title,
  covered: 0,
  total: 1,
  fraction: 0,
  depthScore: 0,
}));

let cachedSource: HomepageCoverageSource | null = null;
let sourcePromise: Promise<HomepageCoverageSource> | null = null;
let idCounter = 0;

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function loadIotCoverageSource(baseUrl: string): Promise<HomepageCoverageSource> {
  if (cachedSource) return Promise.resolve(cachedSource);
  if (sourcePromise) return sourcePromise;

  sourcePromise = fetch(joinBaseUrl(baseUrl, 'home-coverage/iot.json'))
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to load BBC In Our Time coverage source.');
      }
      return response.json() as Promise<HomepageCoverageSource>;
    })
    .then((source) => {
      cachedSource = source;
      sourcePromise = null;
      return source;
    })
    .catch((error) => {
      sourcePromise = null;
      throw error;
    });

  return sourcePromise;
}

export default function HeaderProgressLogo({
  baseUrl,
  size = 34,
}: HeaderProgressLogoProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(() => readChecklistState());
  const [source, setSource] = useState<HomepageCoverageSource | null>(cachedSource);
  const [clipBaseId] = useState(() => `header-progress-${++idCounter}`);

  useEffect(() => subscribeChecklistState(() => {
    setChecklistState(readChecklistState());
  }), []);

  useEffect(() => {
    if (source) return undefined;

    let cancelled = false;
    loadIotCoverageSource(baseUrl)
      .then((nextSource) => {
        if (!cancelled) setSource(nextSource);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [baseUrl, source]);

  const segments = useMemo(
    () => (source
      ? buildPartCoverageSegments(source.entries, checklistState, 'section', PARTS_META)
      : FALLBACK_SEGMENTS),
    [checklistState, source],
  );

  const coverageTotals = useMemo(
    () => segments.reduce(
      (totals, segment) => ({
        covered: totals.covered + segment.covered,
        total: totals.total + segment.total,
      }),
      { covered: 0, total: 0 },
    ),
    [segments],
  );

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 0.85;
  const innerRadius = outerRadius * 0.55;
  const segmentDegrees = 360 / segments.length;
  const gapPx = size <= 36 ? 1.4 : 1.8;
  const cornerRadiusPx = size <= 36 ? 1.7 : 2.1;
  const ariaLabel = source
    ? `BBC In Our Time section coverage: ${coverageTotals.covered} of ${coverageTotals.total} mapped sections covered`
    : 'BBC In Our Time section coverage';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel}
      class="shrink-0"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <defs>
        {segments.map((segment, index) => {
          const fillRadius = innerRadius + segment.fraction * (outerRadius - innerRadius);
          return (
            <clipPath key={segment.partNumber} id={`${clipBaseId}-${index}`}>
              <circle cx={cx} cy={cy} r={fillRadius} />
            </clipPath>
          );
        })}
      </defs>

      {segments.map((segment, index) => {
        const centerDegrees = index * segmentDegrees;
        const segmentPath = roundedDonutSlicePath(
          cx,
          cy,
          innerRadius,
          outerRadius,
          centerDegrees - segmentDegrees / 2,
          centerDegrees + segmentDegrees / 2,
          {
            gapPx,
            cornerRadiusPx,
          },
        );

        return (
          <g key={segment.partNumber}>
            <path d={segmentPath} fill={segment.colorHex} fill-opacity="0.15" />
            <path
              d={segmentPath}
              fill={segment.colorHex}
              fill-opacity="0.9"
              clip-path={`url(#${clipBaseId}-${index})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
