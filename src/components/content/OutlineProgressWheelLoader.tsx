import { h } from 'preact';
import { useOutlineProgressState } from '../../hooks/useOutlineProgressState';
import type { OutlineProgressTargets } from '../../utils/outlineProgressTargets';
import OutlineProgressWheel from './OutlineProgressWheel';

interface OutlineProgressWheelLoaderProps {
  baseUrl: string;
  targets: OutlineProgressTargets;
  size?: number;
  ringWidth?: number;
  containerClassName?: string;
  className?: string;
}

export default function OutlineProgressWheelLoader({
  baseUrl,
  targets,
  size,
  ringWidth,
  containerClassName,
  className,
}: OutlineProgressWheelLoaderProps) {
  const { coverageState, loading } = useOutlineProgressState(baseUrl);

  return (
    <OutlineProgressWheel
      targets={targets}
      coverageState={coverageState}
      loading={loading}
      size={size}
      ringWidth={ringWidth}
      containerClassName={containerClassName}
      className={className}
    />
  );
}
