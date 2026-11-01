import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user } = await authenticateRequest(req);
    const { session_id } = await req.json();

    const adminClient = getSupabaseAdmin();
    if (session_id) {
      await adminClient.from('login_activity').update({
        logout_time: new Date().toISOString(),
        session_status: 'LOGGED_OUT',
      }).eq('id', session_id).eq('user_id', user.id);
    } else {
      // Mark all active sessions for this user as logged out
      await adminClient.from('login_activity').update({
        logout_time: new Date().toISOString(),
        session_status: 'LOGGED_OUT',
      }).eq('user_id', user.id).eq('session_status', 'ACTIVE');
    }

    return new Response(
      JSON.stringify({ ok: true, message: 'Logged out successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
