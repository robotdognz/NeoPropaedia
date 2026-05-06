import { useEffect, useState } from 'preact/hooks';
import {
  getCoverageLayerPreference,
  subscribeCoverageLayerPreference,
  type ReadingType,
} from '../utils/readingPreference';
import type { CoverageLayer } from '../utils/readingLibrary';

export function useCoverageLayerPreferenceState(readingType: ReadingType): CoverageLayer {
  const [coverageLayer, setCoverageLayer] = useState<CoverageLayer>(() => getCoverageLayerPreference(readingType));

  useEffect(() => {
    setCoverageLayer(getCoverageLayerPreference(readingType));
    return subscribeCoverageLayerPreference(readingType, (layer) => {
      setCoverageLayer(layer);
    });
  }, [readingType]);

  return coverageLayer;
}
