import { h } from 'preact';
import Accordion from '../ui/Accordion';

export interface VsiCardProps {
  title: string;
  author: string;
  rationale: string;
}

export default function VsiCard({ title, author, rationale }: VsiCardProps) {
  return (
    <div class="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow duration-200">
      <div class="mb-2">
        <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">{title}</h4>
        <p class="text-sm text-gray-500 mt-0.5">{author}</p>
      </div>

      {rationale && (
        <Accordion title="Why this book?" defaultOpen={false}>
          <p class="text-gray-600">{rationale}</p>
        </Accordion>
      )}
    </div>
  );
}
