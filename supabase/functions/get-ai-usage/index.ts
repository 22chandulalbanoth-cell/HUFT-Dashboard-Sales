import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, requireCentralAdmin, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { profile } = await authenticateRequest(req);
    requireCentralAdmin(profile);

    const adminClient = getSupabaseAdmin();
    const { data: logs, error } = await adminClient
      .from('ai_usage_logs')
      .select('*, profiles(email)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const totalQueries = logs?.length || 0;
    const totalTokens = logs?.reduce((acc: number, l: any) => acc + (l.token_usage || 0), 0) || 0;
    const rateLimited = logs?.filter((l: any) => l.status === 'RATE_LIMITED').length || 0;

    return new Response(
      JSON.stringify({
        ok: true,
        summary: {
          total_queries: totalQueries,
          total_tokens: totalTokens,
          rate_limit_enforcements: rateLimited,
        },
        logs: logs || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
    );
  }
});
