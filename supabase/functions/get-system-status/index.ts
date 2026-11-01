import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, requireCentralAdmin, getSupabaseAdmin, errorResponse } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { profile } = await authenticateRequest(req);
    requireCentralAdmin(profile);

    const adminClient = getSupabaseAdmin();

    // Check DB
    const dbStart = Date.now();
    const { error: dbError } = await adminClient.from('stores').select('id', { count: 'exact', head: true });
    const dbLatency = Date.now() - dbStart;

    // Check recent errors in AI logs
    const { data: recentErrors } = await adminClient
      .from('ai_usage_logs')
      .select('*')
      .eq('status', 'ERROR')
      .order('created_at', { ascending: false })
      .limit(10);

    const hasGeminiKey = !!Deno.env.get('GEMINI_API_KEY');
    const hasGroqKey = !!Deno.env.get('GROQ_API_KEY');

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          timestamp: new Date().toISOString(),
          github: {
            repo: '22chandulalbanoth-cell/HUFT-Dashboard-Sales',
            pages_url: 'https://22chandulalbanoth-cell.github.io/HUFT-Dashboard-Sales/',
            branch: 'main',
            status: 'OPERATIONAL',
          },
          supabase: {
            database_status: dbError ? 'DISCONNECTED' : 'HEALTHY',
            latency_ms: dbLatency,
            auth_service: 'HEALTHY',
            edge_functions: 'HEALTHY',
          },
          ai_providers: {
            gemini: { configured: hasGeminiKey, status: hasGeminiKey ? 'ONLINE' : 'KEY_MISSING' },
            groq: { configured: hasGroqKey, status: hasGroqKey ? 'ONLINE' : 'OPTIONAL_KEY_MISSING' },
          },
          latest_errors: recentErrors || [],
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
