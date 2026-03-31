import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { displaySectionCode, normalizeSectionCode } from '../../utils/helpers';
import { loadSectionRecommendationsPayload } from '../../utils/sectionReadingContext';

export async function getStaticPaths() {
  const sections = await getCollection('sections');
  return sections.map((section) => ({
    params: { sectionCode: normalizeSectionCode(section.data.sectionCode) },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const sectionCodeParam = params.sectionCode;
  if (!sectionCodeParam) {
    return new Response('Not found', { status: 404 });
  }

  const sectionCode = displaySectionCode(sectionCodeParam);
  const sections = await getCollection('sections');
  const section = sections.find((entry) => entry.data.sectionCode === sectionCode)?.data;

  if (!section) {
    return new Response('Not found', { status: 404 });
  }

  const payload = await loadSectionRecommendationsPayload(section);
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
