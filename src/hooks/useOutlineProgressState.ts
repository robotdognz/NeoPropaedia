import { useMemo } from 'preact/hooks';
import { useJsonPayload } from './useJsonPayload';
import { useReadingChecklistState } from './useReadingChecklistState';
import { useReadingPreferenceState } from './useReadingPreferenceState';
import {
  completedChecklistKeysFromState,
  type ChecklistBackedReadingEntry,
} from '../utils/readingLibrary';
import { buildOutlineProgressCoverageState } from '../utils/outlineProgress';

interface OutlineProgressPayload {
  entries: ChecklistBackedReadingEntry[];
}

interface OutlineProgressStateResult {
  coverageState: ReturnType<typeof buildOutlineProgressCoverageState> | null;
  loading: boolean;
  error: boolean;
}

export function useOutlineProgressState(baseUrl: string): OutlineProgressStateResult {
  const readingType = useReadingPreferenceState();
  const checklistState = useReadingChecklistState();
  const { data, error } = useJsonPayload<OutlineProgressPayload>(
    `${baseUrl}/library-data/${readingType}.json`,
  );

  const completedChecklistKeys = useMemo(
    () => completedChecklistKeysFromState(checklistState),
    [checklistState],
  );

  const coverageState = useMemo(
    () => (data ? buildOutlineProgressCoverageState(data.entries, completedChecklistKeys) : null),
    [data, completedChecklistKeys],
  );

  return {
    coverageState,
    loading: !data && !error,
    error,
  };
}
