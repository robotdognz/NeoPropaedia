import { useEffect, useState } from 'preact/hooks';
import { readChecklistState, subscribeChecklistState } from '../utils/readingChecklist';

export function useReadingChecklistState(): Record<string, boolean> {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  return checklistState;
}
