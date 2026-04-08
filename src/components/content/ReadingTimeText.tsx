import { h } from 'preact';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { formatEstimatedReadingTime } from '../../utils/readingSpeed';

interface ReadingTimeTextProps {
  wordCount?: number;
}

export default function ReadingTimeText({ wordCount }: ReadingTimeTextProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const label = formatEstimatedReadingTime(wordCount, readingSpeedWpm);

  if (!label) return null;
  return <>{label}</>;
}
