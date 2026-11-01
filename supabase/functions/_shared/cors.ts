// supabase/functions/_shared/cors.ts
// Only the GitHub Pages site may call these functions from a browser.
const ALLOWED_ORIGINS = [
  'https://22chandulalbanoth-cell.github.io',
];

export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

// Kept for existing imports; prefer corsFor(req) in new code.
export const corsHeaders = corsFor(new Request('https://localhost'));

export function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsFor(req) });
  }
  return null;
}
