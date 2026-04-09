import { h, type ComponentChildren } from 'preact';
import Accordion from '../ui/Accordion';

interface ReadingLibraryStatisticsAccordionProps {
  totalLabel: string;
  totalCount: number;
  totalDescription: string;
  completedCount: number;
  completedDescription: string;
  activeCoverageLabel: string;
  activeCoverageCount: number;
  activeCoverageTotal: number;
  activeCoverageDescription: string;
  children?: ComponentChildren;
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: ComponentChildren;
  description: string;
}) {
  return (
    <div class="rounded-xl border border-gray-200 bg-white p-5">
      <p class="text-sm font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p class="mt-2 font-serif text-3xl text-gray-900">{value}</p>
      <p class="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}

export default function ReadingLibraryStatisticsAccordion({
  totalLabel,
  totalCount,
  totalDescription,
  completedCount,
  completedDescription,
  activeCoverageLabel,
  activeCoverageCount,
  activeCoverageTotal,
  activeCoverageDescription,
  children,
}: ReadingLibraryStatisticsAccordionProps) {
  return (
    <Accordion title="Library Statistics" defaultOpen={false}>
      <div class="space-y-4">
        <div class="grid gap-4 xl:grid-cols-3">
          <StatCard
            label={totalLabel}
            value={totalCount}
            description={totalDescription}
          />
          <StatCard
            label="Checked Off"
            value={completedCount}
            description={completedDescription}
          />
          <StatCard
            label={activeCoverageLabel}
            value={`${activeCoverageCount} / ${activeCoverageTotal}`}
            description={activeCoverageDescription}
          />
        </div>
        {children}
      </div>
    </Accordion>
  );
}
