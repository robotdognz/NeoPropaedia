import { h } from 'preact';
import VsiCard from './VsiCard';

export interface VsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationale: string;
}

export interface VsiRecommendationsProps {
  mappings: VsiMapping[];
}

export default function VsiRecommendations({ mappings }: VsiRecommendationsProps) {
  if (!mappings || mappings.length === 0) return null;

  return (
    <section class="mt-6">
      <div class="flex items-center gap-3 mb-4">
        <h3 class="font-serif text-lg font-semibold text-gray-900">
          Oxford VSI Recommendations
        </h3>
        <span class="inline-flex items-center justify-center px-2 py-0.5 text-xs font-mono font-medium text-indigo-700 bg-indigo-100 rounded-full">
          {mappings.length}
        </span>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mappings.map((m, i) => (
          <VsiCard
            key={`${m.vsiTitle}-${i}`}
            title={m.vsiTitle}
            author={m.vsiAuthor}
            rationale={m.rationale}
          />
        ))}
      </div>
    </section>
  );
}
