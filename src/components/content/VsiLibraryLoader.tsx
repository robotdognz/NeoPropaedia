import { h } from 'preact';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { VsiLibraryPayload } from '../../utils/readingLibraryPayloads';
import VsiLibrary from './VsiLibrary';

interface VsiLibraryLoaderProps {
  dataUrl: string;
  baseUrl: string;
}

export default function VsiLibraryLoader({ dataUrl, baseUrl }: VsiLibraryLoaderProps) {
  const { data, error } = useJsonPayload<VsiLibraryPayload>(dataUrl);

  if (error) {
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        Could not load the VSI library right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Loading the VSI library...
      </div>
    );
  }

  return (
    <VsiLibrary
      entries={data.entries}
      baseUrl={baseUrl}
      partsMeta={data.partsMeta}
    />
  );
}
