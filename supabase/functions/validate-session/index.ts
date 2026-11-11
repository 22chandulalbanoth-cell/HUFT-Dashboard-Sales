import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getSupabaseAdmin, errorResponse } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const adminClient = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id || '';

    if (!sessionId) {
      return new Response(
        JSON.stringify({ valid: false, session_status: 'MISSING_SESSION', message: 'No session_id provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const { data, error } = await adminClient
      .from('login_activity')
      .select('id, user_id, user_email, store_id, session_status, login_time, logout_time')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return new Response(
        JSON.stringify({ valid: false, session_status: 'NOT_FOUND', message: 'Session not found in records' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const isActive = data.session_status === 'ACTIVE';

    return new Response(
      JSON.stringify({
        valid: isActive,
        session_id: data.id,
        session_status: data.session_status,
        user_email: data.user_email,
        store_id: data.store_id,
        login_time: data.login_time,
        logout_time: data.logout_time,
        message: isActive ? 'Session valid and active' : 'Session has been revoked or terminated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
