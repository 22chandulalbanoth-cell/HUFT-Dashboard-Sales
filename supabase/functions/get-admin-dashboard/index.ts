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

    const [
      { data: profiles },
      { data: pendingRegistrations },
      { data: pendingResets },
      { data: recentLogins },
      { data: settings },
    ] = await Promise.all([
      adminClient.from('profiles').select('*, user_store_access(store_id, access_level)').order('created_at', { ascending: false }),
      adminClient.from('registration_requests').select('*').eq('status', 'PENDING').order('requested_at', { ascending: false }),
      adminClient.from('password_reset_requests').select('*, profiles(email)').eq('status', 'PENDING').order('requested_at', { ascending: false }),
      adminClient.from('login_activity').select('*').order('login_time', { ascending: false }).limit(50),
      adminClient.from('system_settings').select('*'),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          profiles: profiles || [],
          pending_registrations: pendingRegistrations || [],
          pending_resets: pendingResets || [],
          recent_logins: recentLogins || [],
          settings: settings || [],
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
