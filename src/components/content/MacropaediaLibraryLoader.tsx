import { h } from 'preact';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { MacropaediaLibraryPayload } from '../../utils/readingLibraryPayloads';
import MacropaediaLibrary from './MacropaediaLibrary';

interface MacropaediaLibraryLoaderProps {
  dataUrl: string;
  baseUrl: string;
}

export default function MacropaediaLibraryLoader({
  dataUrl,
  baseUrl,
}: MacropaediaLibraryLoaderProps) {
  const { data, error } = useJsonPayload<MacropaediaLibraryPayload>(dataUrl);

  if (error) {
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        Could not load the Britannica article list right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Loading the Britannica article list...
      </div>
    );
  }

  return (
    <MacropaediaLibrary
      entries={data.entries}
      baseUrl={baseUrl}
      partsMeta={data.partsMeta}
    />
  );
}
