import { h, type ComponentChildren } from 'preact';
import Accordion from '../ui/Accordion';
import type {
  RecommendationCardBadge,
  RecommendationCardFlag,
} from '../../utils/recommendationCardMeta';

export interface ReadingRecommendationCardProps {
  title: string;
  href: string;
  metadata?: string | null;
  matchPercent?: number;
  flags?: RecommendationCardFlag[];
  badges?: RecommendationCardBadge[];
  whyTitle?: string;
  whyContent?: ComponentChildren;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkboxAriaLabel: string;
}

function matchColor(percent: number): string {
  if (percent >= 70) return 'bg-emerald-500';
  if (percent >= 40) return 'bg-emerald-400';
  if (percent >= 20) return 'bg-amber-400';
  return 'bg-gray-300';
}

function flagToneClass(tone: RecommendationCardFlag['tone'] = 'muted'): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'warning':
      return 'border-amber-100 bg-amber-50 text-amber-700';
    case 'info':
      return 'border-indigo-100 bg-indigo-50 text-indigo-600';
    case 'topic':
      return 'border-violet-100 bg-violet-50 text-violet-600';
    case 'muted':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

function badgeToneClass(tone: RecommendationCardBadge['tone'] = 'neutral'): string {
  switch (tone) {
    case 'accent':
      return 'bg-amber-100 text-amber-900';
    case 'neutral':
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function ReadingRecommendationCard({
  title,
  href,
  metadata,
  matchPercent,
  flags = [],
  badges = [],
  whyTitle,
  whyContent,
  checked,
  onCheckedChange,
  checkboxAriaLabel,
}: ReadingRecommendationCardProps) {
  const showMatch = matchPercent !== undefined && matchPercent > 0;
  const showMetadata = Boolean(metadata);
  const showFlags = flags.length > 0;
  const showBadges = badges.length > 0;

  return (
    <div class={`rounded-xl border border-amber-200 bg-white p-4 transition-shadow duration-200 hover:shadow-md ${checked ? 'border-slate-300 bg-slate-200/70 opacity-50' : ''}`}>
      <div class="mb-2 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">
            <a href={href} class="transition-colors hover:text-indigo-700">
              {title}
            </a>
          </h4>
          {showMetadata ? (
            <p class="mt-1 text-sm text-gray-500">{metadata}</p>
          ) : null}
        </div>
        <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange((event.currentTarget as HTMLInputElement).checked)}
            class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            aria-label={checkboxAriaLabel}
          />
          Done
        </label>
      </div>

      {showMatch ? (
        <div class="mb-3 flex items-center gap-2">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              class={`h-full rounded-full ${matchColor(matchPercent)}`}
              style={{ width: `${matchPercent}%` }}
            />
          </div>
          <span class="whitespace-nowrap text-[10px] font-sans text-gray-400">
            {matchPercent}% relevance
          </span>
        </div>
      ) : null}

      {showFlags ? (
        <div class="mb-3 flex flex-wrap gap-1.5 text-[10px] font-medium tracking-[0.02em]">
          {flags.map((flag) => (
            <span
              key={flag.label}
              class={`inline-flex items-center rounded-md border px-2 py-0.5 ${flagToneClass(flag.tone)}`}
            >
              {flag.label}
            </span>
          ))}
        </div>
      ) : null}

      {showBadges ? (
        <div class="mb-3 flex flex-wrap gap-1.5 text-[10px] font-medium tracking-[0.02em]">
          {badges.map((badge) => (
            <span
              key={badge.label}
              class={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeToneClass(badge.tone)}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      {whyTitle && whyContent ? (
        <Accordion title={whyTitle} defaultOpen={false}>
          {whyContent}
        </Accordion>
      ) : null}
    </div>
  );
}
