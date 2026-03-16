import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import { slugify } from '../../utils/helpers';
import {
  wikipediaChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';

export interface WikipediaArticleRef {
  title: string;
  displayTitle?: string;
  url: string;
  lowestLevel: number;
}

export interface WikipediaRefsProps {
  articles: WikipediaArticleRef[];
  baseUrl: string;
}

const STORAGE_KEY = 'propaedia-wiki-level';

function getStoredLevel(): number {
  if (typeof window === 'undefined') return 2;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return 1;
  if (stored === '3') return 3;
  return 2;
}

export default function WikipediaRefs({ articles, baseUrl }: WikipediaRefsProps) {
  const [level, setLevel] = useState(2);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLevel(getStoredLevel());
    setChecklistState(readChecklistState());
    const unsub = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const onStorage = () => setLevel(getStoredLevel());
    window.addEventListener('storage', onStorage);
    return () => { unsub(); window.removeEventListener('storage', onStorage); };
  }, []);

  if (!articles || articles.length === 0) return null;

  const filtered = articles.filter((a) => a.lowestLevel <= level);

  if (filtered.length === 0) return null;

  return (
    <Accordion title={`Wikipedia Article Recommendations (${filtered.length})`}>
      <div class="mb-4 flex items-center justify-between">
        <span class="text-xs text-gray-500">
          Showing Level {level === 1 ? '1 (Top 10)' : level === 2 ? '2 (Top 100)' : '3 (~1,000)'}
        </span>
        <a
          href={`${baseUrl}/wikipedia`}
          class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          Browse all Wikipedia articles
        </a>
      </div>

      <ul class="space-y-2">
        {filtered.map((article) => {
          const checkKey = wikipediaChecklistKey(article.title);
          const isChecked = Boolean(checklistState[checkKey]);

          return (
            <li key={article.title} class="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-gray-50">
              <a
                href={`${baseUrl}/wikipedia/${slugify(article.title)}`}
                class={`min-w-0 flex-1 text-sm transition-colors ${isChecked ? 'text-gray-400 line-through' : 'text-gray-700 hover:text-indigo-700'}`}
              >
                {article.displayTitle || article.title}
              </a>
              <div class="flex items-center gap-3 flex-shrink-0">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  Wikipedia ↗
                </a>
                <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => writeChecklistState(checkKey, (event.currentTarget as HTMLInputElement).checked)}
                    class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`Mark ${article.title} as read`}
                  />
                  Done
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </Accordion>
  );
}
