import { useEffect, useState } from 'preact/hooks';
import {
  getReadingSpeedWpm,
  subscribeReadingSpeed,
} from '../utils/readingSpeed';

export function useReadingSpeedState(): number {
  const [readingSpeedWpm, setReadingSpeedWpm] = useState<number>(() => getReadingSpeedWpm());

  useEffect(() => {
    setReadingSpeedWpm(getReadingSpeedWpm());
    return subscribeReadingSpeed((next) => {
      setReadingSpeedWpm(next);
    });
  }, []);

  return readingSpeedWpm;
}
