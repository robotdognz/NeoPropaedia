import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { ReadingSectionSummary } from '../../utils/readingData';
import { sectionUrl } from '../../utils/helpers';

interface ReadingSectionLinksProps {
  sections: ReadingSectionSummary[];
  baseUrl: string;
  label: string;
  variant?: 'details' | 'chips';
}

export default function ReadingSectionLinks({
  sections,
  baseUrl,
  label,
  variant = 'details',
}: ReadingSectionLinksProps) {
  const [open, setOpen] = useState(false);

  if (sections.length === 0) return null;

  if (variant === 'chips') {
    return (
      <div class="mt-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          class="text-xs font-medium text-amber-800 hover:text-amber-950 underline"
        >
          {open ? 'Hide sections' : label}
        </button>
        {open && (
          <ul class="mt-2 flex flex-wrap gap-1.5">
            {sections.map((section) => (
              <li key={section.sectionCode}>
                <a
                  href={sectionUrl(section.sectionCode, baseUrl)}
                  class="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                >
                  {section.sectionCode}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <details class="group mt-4 rounded-lg border border-gray-200 bg-gray-50">
      <summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700 [&::-webkit-details-marker]:hidden">
        <div class="flex items-center justify-between gap-3">
          <span>{label}</span>
          <svg
            class="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </summary>
      <ul class="space-y-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
        {sections.map((section) => (
          <li key={section.sectionCode}>
            <a
              href={sectionUrl(section.sectionCode, baseUrl)}
              class="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              <span class="font-semibold text-gray-700">Section {section.sectionCodeDisplay}</span>
              <span>{section.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
