import type { APIRoute } from 'astro';
import { loadOutlineGraph } from '../utils/outlineGraph';
import { buildSidebarNavigation } from '../utils/sidebarNavigation';

let payloadPromise: Promise<ReturnType<typeof buildSidebarNavigation>> | undefined;

async function loadPayload() {
  if (!payloadPromise) {
    payloadPromise = loadOutlineGraph().then((outline) =>
      buildSidebarNavigation(outline.parts, import.meta.env.BASE_URL),
    );
  }

  return payloadPromise;
}

export const GET: APIRoute = async () => {
  const payload = await loadPayload();

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
