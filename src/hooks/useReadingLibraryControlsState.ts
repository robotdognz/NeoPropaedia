import { useEffect, useState } from 'preact/hooks';
import {
  getReadingLibraryControlsPreference,
  setReadingLibraryControlsPreference,
  type ReadingLibraryControlsPreference,
  type ReadingType,
} from '../utils/readingPreference';

export function useReadingLibraryControlsState<TSortField extends string>(
  readingType: ReadingType,
  defaultSortField: TSortField,
  defaultSortDirection: 'asc' | 'desc' = 'desc'
) {
  const [controls, setControls] = useState<ReadingLibraryControlsPreference<TSortField>>(() =>
    getReadingLibraryControlsPreference(readingType, defaultSortField, defaultSortDirection)
  );

  useEffect(() => {
    setControls(getReadingLibraryControlsPreference(readingType, defaultSortField, defaultSortDirection));
  }, [readingType, defaultSortField, defaultSortDirection]);

  useEffect(() => {
    setReadingLibraryControlsPreference(readingType, controls);
  }, [readingType, controls]);

  return {
    checkedOnly: controls.checkedOnly,
    shelvedOnly: controls.shelvedOnly,
    sortField: controls.sortField,
    sortDirection: controls.sortDirection,
    setCheckedOnly: (checkedOnly: boolean) => {
      setControls((previous) => ({ ...previous, checkedOnly }));
    },
    setShelvedOnly: (shelvedOnly: boolean) => {
      setControls((previous) => ({ ...previous, shelvedOnly }));
    },
    setSortField: (sortField: TSortField) => {
      setControls((previous) => ({ ...previous, sortField }));
    },
    setSortDirection: (sortDirection: 'asc' | 'desc') => {
      setControls((previous) => ({ ...previous, sortDirection }));
    },
  };
}
