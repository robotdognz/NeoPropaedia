import type { APIRoute } from 'astro';
import { buildHomepageCoverageSource } from '../../utils/homepageCoverageSource';
import type { ReadingType } from '../../utils/readingPreference';

const TYPES: ReadingType[] = ['vsi', 'iot', 'wikipedia', 'macropaedia'];

export function getStaticPaths() {
  return TYPES.map((type) => ({
    params: { type },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const type = params.type as ReadingType | undefined;
  if (!type || !TYPES.includes(type)) {
    return new Response('Not found', { status: 404 });
  }

  const source = await buildHomepageCoverageSource(type, import.meta.env.BASE_URL);
  return new Response(JSON.stringify(source), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
