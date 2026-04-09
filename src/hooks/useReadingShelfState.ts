import { useEffect, useState } from 'preact/hooks';
import { readShelfState, subscribeShelfState } from '../utils/readingShelf';

export function useReadingShelfState(): Record<string, boolean> {
  const [shelfState, setShelfState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setShelfState(readShelfState());
    return subscribeShelfState(() => {
      setShelfState(readShelfState());
    });
  }, []);

  return shelfState;
}
