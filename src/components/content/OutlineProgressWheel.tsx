import { h } from 'preact';
import { buildOutlineProgressRings, describeOutlineProgress } from '../../utils/outlineProgress';
import type { OutlineProgressCoverageState } from '../../utils/outlineProgress';
import type { OutlineProgressTargets } from '../../utils/outlineProgressTargets';
import CoverageRings from '../ui/CoverageRings';

interface OutlineProgressWheelProps {
  targets: OutlineProgressTargets;
  coverageState: OutlineProgressCoverageState | null;
  loading?: boolean;
  size?: number;
  ringWidth?: number;
  containerClassName?: string;
  className?: string;
}

export default function OutlineProgressWheel({
  targets,
  coverageState,
  loading = false,
  size = 88,
  ringWidth = 8,
  containerClassName,
  className,
}: OutlineProgressWheelProps) {
  const summary = coverageState ? describeOutlineProgress(targets, coverageState) : 'Loading progress';

  if (!coverageState || loading) {
    return (
      <div
        class={className}
        aria-hidden="true"
        title={summary}
      >
        <div
          class={`rounded-full border border-slate-200 bg-slate-50 ${containerClassName ?? 'h-12 w-12'}`}
        />
      </div>
    );
  }

  return (
    <div class={className} title={summary} aria-label={summary}>
      <CoverageRings
        rings={buildOutlineProgressRings(targets, coverageState)}
        size={size}
        ringWidth={ringWidth}
        containerClassName={containerClassName}
        hideLegend
      />
    </div>
  );
}
