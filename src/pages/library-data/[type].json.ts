import type { APIRoute } from 'astro';
import {
  loadLibraryPayload,
  type RemoteLibraryType,
} from '../../utils/readingLibraryPayloads';

const TYPES: RemoteLibraryType[] = ['vsi', 'wikipedia', 'iot', 'macropaedia'];

export function getStaticPaths() {
  return TYPES.map((type) => ({
    params: { type },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const type = params.type as RemoteLibraryType | undefined;
  if (!type || !TYPES.includes(type)) {
    return new Response('Not found', { status: 404 });
  }

  const payload = await loadLibraryPayload(type);
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
