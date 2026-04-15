import { h } from 'preact';
import { useOutlineProgressState } from '../../hooks/useOutlineProgressState';
import type { OutlineProgressTargets } from '../../utils/outlineProgressTargets';
import OutlineProgressWheel from './OutlineProgressWheel';

interface OutlineHomepagePartCardItem {
  href: string;
  partName: string;
  title: string;
  colorHex: string;
  divisionCount: number;
  sectionCount: number;
  subsectionCount: number;
  progressTargets: OutlineProgressTargets;
}

interface OutlineHomepagePartCardsProps {
  baseUrl: string;
  items: OutlineHomepagePartCardItem[];
}

export default function OutlineHomepagePartCards({
  baseUrl,
  items,
}: OutlineHomepagePartCardsProps) {
  const { coverageState, loading } = useOutlineProgressState(baseUrl);

  return (
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((part) => (
        <a
          key={part.href}
          href={part.href}
          class="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-2">
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
                {part.partName}
              </p>
              <h3
                class="font-serif text-xl transition-colors group-hover:text-indigo-700"
                style={`color: ${part.colorHex};`}
              >
                {part.title}
              </h3>
            </div>
            <OutlineProgressWheel
              targets={part.progressTargets}
              coverageState={coverageState}
              loading={loading}
              size={88}
              ringWidth={8}
              containerClassName="h-12 w-12"
              className="pointer-events-none shrink-0"
            />
          </div>

          <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
            <span class="rounded-full bg-white px-2.5 py-1">
              {part.divisionCount} {part.divisionCount === 1 ? 'Division' : 'Divisions'}
            </span>
            <span class="rounded-full bg-white px-2.5 py-1">
              {part.sectionCount} {part.sectionCount === 1 ? 'Section' : 'Sections'}
            </span>
            <span class="rounded-full bg-white px-2.5 py-1">
              {part.subsectionCount} {part.subsectionCount === 1 ? 'Subsection' : 'Subsections'}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
