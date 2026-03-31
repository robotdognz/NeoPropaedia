import { h } from 'preact';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { SectionReadingRecommendationsPayload } from '../../utils/sectionReadingContext';
import SectionReadingRecommendations from './SectionReadingRecommendations';

interface SectionReadingRecommendationsLoaderProps {
  dataUrl: string;
  baseUrl: string;
}

export default function SectionReadingRecommendationsLoader({
  dataUrl,
  baseUrl,
}: SectionReadingRecommendationsLoaderProps) {
  const { data, error } = useJsonPayload<SectionReadingRecommendationsPayload>(dataUrl);

  if (error) {
    return (
      <div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        Could not load the mapped recommendations right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Loading mapped recommendations...
      </div>
    );
  }

  return (
    <SectionReadingRecommendations
      {...data}
      baseUrl={baseUrl}
    />
  );
}
