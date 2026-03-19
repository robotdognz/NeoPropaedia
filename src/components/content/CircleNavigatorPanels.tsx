import { h } from 'preact';
import {
  macropaediaChecklistKey,
  vsiChecklistKey,
  wikipediaChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import type { ReadingType } from '../../utils/readingPreference';
import { divisionUrl, sectionUrl, slugify } from '../../utils/helpers';
import Accordion from '../ui/Accordion';
import TopReadings from './TopReadings';
import type {
  BridgeItem,
  BridgePair,
  CircleNavigatorPart,
  ConnectionSummary,
  PartReadings,
} from './circleNavigatorShared';
import { getConnectionKey } from './circleNavigatorShared';

interface CenteredCircleNavigatorPanelProps {
  parts: CircleNavigatorPart[];
  centerPart: CircleNavigatorPart;
  centerPartNumber: number;
  topPart: CircleNavigatorPart;
  connectionSummary: ConnectionSummary | null;
  suggestedSections: ConnectionSummary['sections'];
  bridgeRecommendations: Record<string, BridgePair>;
  readingPref: ReadingType;
  checklistState: Record<string, boolean>;
  baseUrl: string;
}

interface TopPartCircleNavigatorPanelProps {
  topPart: CircleNavigatorPart;
  topPartNumber: number;
  partReadings: Record<string, PartReadings>;
  baseUrl: string;
}

interface BridgeRecommendationSectionConfig {
  items: BridgeItem[];
  type: ReadingType;
  title: string;
  maxTotal: number;
  browseHref: string;
  browseLabel: string;
  getHref: (item: BridgeItem) => string;
  getCheckKey: (item: BridgeItem) => string;
}

export function CenteredCircleNavigatorPanel({
  parts,
  centerPart,
  centerPartNumber,
  topPart,
  connectionSummary,
  suggestedSections,
  bridgeRecommendations,
  readingPref,
  checklistState,
  baseUrl,
}: CenteredCircleNavigatorPanelProps) {
  const bridgeKey = getConnectionKey(centerPartNumber, topPart.partNumber);
  const bridge = bridgeRecommendations[bridgeKey];
  const isFlipped = centerPartNumber > topPart.partNumber;
  const bridgeVsi = bridge?.vsi ?? [];
  const bridgeWiki = bridge?.wiki ?? [];
  const bridgeMacro = bridge?.macro ?? [];
  const bridgeSections: BridgeRecommendationSectionConfig[] = [
    {
      items: bridgeVsi,
      type: 'vsi',
      title: 'Oxford VSI Recommendations',
      maxTotal: bridgeVsi.length > 0 ? Math.max(...bridgeVsi.map((item) => item.ca + item.cb)) : 1,
      browseHref: `${baseUrl}/vsi`,
      browseLabel: 'Browse all Oxford VSI books',
      getHref: (item) => `${baseUrl}/vsi/${slugify(item.t)}`,
      getCheckKey: (item) => vsiChecklistKey(item.t, item.a || ''),
    },
    {
      items: bridgeWiki,
      type: 'wikipedia',
      title: 'Wikipedia Article Recommendations',
      maxTotal: bridgeWiki.length > 0 ? Math.max(...bridgeWiki.map((item) => item.ca + item.cb)) : 1,
      browseHref: `${baseUrl}/wikipedia`,
      browseLabel: 'Browse all Wikipedia articles',
      getHref: (item) => `${baseUrl}/wikipedia/${slugify(item.t)}`,
      getCheckKey: (item) => wikipediaChecklistKey(item.t),
    },
    {
      items: bridgeMacro,
      type: 'macropaedia',
      title: 'Macropaedia Reading List',
      maxTotal: bridgeMacro.length > 0 ? Math.max(...bridgeMacro.map((item) => item.ca + item.cb)) : 1,
      browseHref: `${baseUrl}/macropaedia`,
      browseLabel: 'Browse all Macropaedia articles',
      getHref: (item) => `${baseUrl}/macropaedia/${slugify(item.t)}`,
      getCheckKey: (item) => macropaediaChecklistKey(item.t),
    },
  ]
    .filter((section) => section.items.length > 0)
    .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));

  return (
    <>
      <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
        Circle of learning
      </p>
      <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
        Centred on {centerPart.title}, with {topPart.title} at the top.
        {suggestedSections.length > 0 && centerPartNumber !== topPart.partNumber && (
          <>{' '}See where these fields connect below.</>
        )}
      </p>

      {suggestedSections.length > 0 && connectionSummary && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            Connected sections
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
            {connectionSummary.isDirect
              ? `Sections where ${centerPart.title} and ${topPart.title} cross-reference each other${connectionSummary.hasKeyword ? ', supplemented by sections with related subject matter.' : '.'}`
              : connectionSummary.hasConnectionData
                ? `Sections that connect ${centerPart.title} and ${topPart.title} through shared references and related subject matter.`
                : `Sections with related subject matter across ${centerPart.title} and ${topPart.title}.`}
          </p>
          <ul class="mt-2 space-y-1">
            {suggestedSections.map((item) => {
              const part = parts.find((candidate) => candidate.partNumber === item.section.partNumber);
              return (
                <li key={item.section.sectionCode}>
                  <a
                    href={sectionUrl(item.section.sectionCode, baseUrl)}
                    class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                  >
                    <span
                      class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: part?.colorHex || '#94a3b8' }}
                    />
                    <span class="text-slate-700 group-hover:text-indigo-700">{item.section.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {bridgeSections.length > 0 && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            Recommended Readings
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
            Books and articles independently recommended for both {centerPart.partName}: {centerPart.title} and {topPart.partName}: {topPart.title}. Ranked by how deeply they connect the two parts - considering sections, outline items, and overall spread. The bar shows the balance of coverage between the two chosen parts.
          </p>
          <div class="mt-3 flex items-center gap-3 text-[10px] font-sans text-slate-400">
            <span class="flex items-center gap-1">
              <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: centerPart.colorHex }} />
              {centerPart.partName}
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: topPart.colorHex }} />
              {topPart.partName}
            </span>
          </div>
          <div class="mt-3 space-y-4">
            {bridgeSections.map((section) => (
              <Accordion
                key={section.type}
                title={`${section.title} (${section.items.length})`}
                forceOpenKey={readingPref === section.type ? 0 : undefined}
                forceCloseKey={readingPref !== section.type ? 0 : undefined}
              >
                <div class="mb-4 flex justify-end">
                  <a href={section.browseHref} class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline">
                    {section.browseLabel}
                  </a>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => {
                    const centerCount = isFlipped ? item.cb : item.ca;
                    const topCount = isFlipped ? item.ca : item.cb;
                    const relevancePct = item.r ?? Math.round(((centerCount + topCount) / section.maxTotal) * 100);
                    const total = centerCount + topCount;
                    const scale = relevancePct / 100;
                    const centerPct = total > 0 ? Math.round((centerCount / total) * scale * 100) : 0;
                    const topPct = total > 0 ? Math.round((topCount / total) * scale * 100) : 0;
                    const checkKey = section.getCheckKey(item);
                    const isChecked = Boolean(checklistState[checkKey]);
                    const whyLabel = section.type === 'vsi' ? 'Why this book?' : 'Why this article?';
                    const balanceDesc = Math.abs(centerCount - topCount) <= 1
                      ? 'with roughly equal coverage of both'
                      : centerCount > topCount
                        ? `leaning more toward ${centerPart.title}`
                        : `leaning more toward ${topPart.title}`;
                    const rationale = `Independently recommended in ${centerCount} section${centerCount !== 1 ? 's' : ''} of ${centerPart.title} and ${topCount} section${topCount !== 1 ? 's' : ''} of ${topPart.title}, ${balanceDesc}. Items are ranked higher when they bridge both parts evenly rather than being concentrated in one.`;

                    return (
                      <div
                        key={item.t}
                        class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-slate-300 bg-slate-200/70 opacity-50' : 'border-gray-200'}`}
                      >
                        <div class="mb-2 flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">
                              <a href={section.getHref(item)} class="hover:text-indigo-700 transition-colors">{item.t}</a>
                            </h4>
                            {item.a && <p class="text-sm text-gray-500 mt-0.5">{item.a}</p>}
                          </div>
                          <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => writeChecklistState(checkKey, (event.currentTarget as HTMLInputElement).checked)}
                              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            Done
                          </label>
                        </div>
                        <div class="mb-3 flex items-center gap-2">
                          <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div class="flex h-full">
                              <div class="rounded-l-full" style={{ width: `${centerPct}%`, backgroundColor: centerPart.colorHex }} />
                              <div style={{ width: `${topPct}%`, backgroundColor: topPart.colorHex, borderRadius: centerPct === 0 ? '9999px 0 0 9999px' : topPct + centerPct >= 100 ? '0 9999px 9999px 0' : '0' }} />
                            </div>
                          </div>
                          <span class="text-[10px] font-sans text-gray-400 whitespace-nowrap">{relevancePct}% relevance</span>
                        </div>
                        <Accordion title={whyLabel} defaultOpen={false}>
                          <p class="text-gray-600">{rationale}</p>
                        </Accordion>
                      </div>
                    );
                  })}
                </div>
              </Accordion>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function TopPartCircleNavigatorPanel({
  topPart,
  topPartNumber,
  partReadings,
  baseUrl,
}: TopPartCircleNavigatorPanelProps) {
  const activePartReadings = partReadings[String(topPartNumber)];

  return (
    <>
      <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
        Circle of learning
      </p>
      <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
        {topPart.title} is at the top.
      </p>

      <div class="mt-3 border-t border-slate-200 pt-3">
        <a
          href={topPart.href}
          class="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          Read essay
        </a>
      </div>

      {topPart.divisions.length > 0 && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            {topPart.divisions.length} {topPart.divisions.length === 1 ? 'Division' : 'Divisions'}
          </p>
          <ul class="mt-2 space-y-1">
            {topPart.divisions.map((division) => (
              <li key={division.divisionId}>
                <a
                  href={divisionUrl(division.divisionId, baseUrl)}
                  class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                >
                  <span
                    class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: topPart.colorHex }}
                  />
                  <span class="text-slate-700 group-hover:text-indigo-700">
                    <span class="text-slate-400">{division.romanNumeral}.</span>{' '}{division.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activePartReadings && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <TopReadings
            vsi={activePartReadings.vsi}
            wiki={activePartReadings.wiki}
            macro={activePartReadings.macro}
            baseUrl={baseUrl}
            contextLabel="this part"
            countLabel="divisions"
          />
        </div>
      )}
    </>
  );
}
