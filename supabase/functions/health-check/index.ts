import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = getSupabaseAdmin();
    const start = Date.now();
    const { error } = await supabase.from('stores').select('id', { count: 'exact', head: true });
    const latency = Date.now() - start;

    return new Response(
      JSON.stringify({
        ok: !error,
        status: error ? 'DEGRADED' : 'HEALTHY',
        database: error ? error.message : 'CONNECTED',
        latency_ms: latency,
        version: '1.0.4',
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, status: 'ERROR', error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
