import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, requireCentralAdmin, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { profile, user } = await authenticateRequest(req);
    requireCentralAdmin(profile);

    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'request_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const adminClient = getSupabaseAdmin();
    await adminClient.from('registration_requests').update({
      status: 'REJECTED',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    }).eq('id', request_id);

    await adminClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'REJECT_REGISTRATION',
      resource: `Request ID: ${request_id}`,
    });

    return new Response(
      JSON.stringify({ ok: true, message: 'Registration request rejected.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
    );
  }
});
