import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, errorResponse, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user } = await authenticateRequest(req);
    const { store_id, activity_type } = await req.json();

    if (!activity_type) {
      return new Response(
        JSON.stringify({ ok: false, error: 'activity_type is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const adminClient = getSupabaseAdmin();
    await adminClient.from('usage_logs').insert({
      user_id: user.id,
      store_id: store_id || 'Hyderguda',
      activity_type: activity_type,
      event_time: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err);
  }
});
