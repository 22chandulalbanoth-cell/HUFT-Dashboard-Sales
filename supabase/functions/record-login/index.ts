import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, getSupabaseAdmin, errorResponse } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user } = await authenticateRequest(req);
    const { store_id, computer_name } = await req.json().catch(() => ({}));

    const adminClient = getSupabaseAdmin();

    // 1. Enforce Single-Device Login Rule: One Account = One Device at a Time
    // Automatically terminate any existing active sessions for this user account
    await adminClient
      .from('login_activity')
      .update({
        logout_time: new Date().toISOString(),
        session_status: 'TERMINATED',
      })
      .eq('user_id', user.id)
      .eq('session_status', 'ACTIVE');

    // 2. Register new active session for the current device
    const { data, error } = await adminClient.from('login_activity').insert({
      user_id: user.id,
      store_id: store_id || 'Hyderguda',
      computer_name: computer_name || 'Store POS Terminal',
      login_time: new Date().toISOString(),
      session_status: 'ACTIVE',
    }).select().single();

    if (error) throw error;

    // Trigger 24-hour cleanup of stale monitoring logs
    await adminClient.rpc('cleanup_stale_monitoring_logs').catch(() => {});

    return new Response(
      JSON.stringify({ ok: true, session_id: data.id, message: 'Single-device login session established' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
