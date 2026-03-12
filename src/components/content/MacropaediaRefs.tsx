import { h } from 'preact';
import Accordion from '../ui/Accordion';

export interface MacropaediaRefsProps {
  references: string[];
}

/**
 * Displays Macropaedia article references in a collapsible accordion.
 * These are historical references from the Britannica print edition
 * and are not clickable links.
 */
export default function MacropaediaRefs({ references }: MacropaediaRefsProps) {
  if (!references || references.length === 0) return null;

  return (
    <Accordion title="Macropaedia Reading List">
      <ul class="space-y-2">
        {references.map((ref, i) => (
          <li key={i} class="flex items-start gap-2 text-gray-500">
            {/* Book icon */}
            <svg
              class="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width={1.5}
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
            <span class="text-sm text-gray-500 italic leading-snug">{ref}</span>
          </li>
        ))}
      </ul>
    </Accordion>
  );
}
