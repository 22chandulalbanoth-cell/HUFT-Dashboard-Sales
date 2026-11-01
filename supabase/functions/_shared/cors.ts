// supabase/functions/_shared/cors.ts
// Allowed origins for Cloudflare Pages and GitHub Pages
const ALLOWED_ORIGINS = [
  'https://huft-sales-dashboard.pages.dev',
  'https://22chandulalbanoth-cell.github.io',
];

export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = 
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.github.io') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

// Kept for existing imports; prefer corsFor(req) in new code.
export const corsHeaders = corsFor(new Request('https://huft-sales-dashboard.pages.dev'));

export function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsFor(req) });
  }
  return null;
}
