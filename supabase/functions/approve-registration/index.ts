import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, requireCentralAdmin, getSupabaseAdmin, errorResponse } from '../_shared/auth.ts';

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
    const { data: request, error: reqError } = await adminClient
      .from('registration_requests')
      .select('*')
      .eq('id', request_id)
      .single();

    if (reqError || !request) throw new Error('Registration request not found');

    // Update request
    await adminClient.from('registration_requests').update({
      status: 'APPROVED',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    }).eq('id', request_id);

    // Find profile by email and activate
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', request.email)
      .single();

    if (targetProfile) {
      await adminClient.from('profiles').update({
        role: request.requested_role,
        active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', targetProfile.id);

      await adminClient.from('user_store_access').upsert({
        user_id: targetProfile.id,
        store_id: request.store_id,
        access_level: request.requested_role === 'STORE_MANAGER' ? 'MANAGER' : 'USER',
      });
    }

    // Log to audit_logs
    await adminClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'APPROVE_REGISTRATION',
      resource: `User: ${request.email}, Store: ${request.store_id}`,
    });

    return new Response(
      JSON.stringify({ ok: true, message: `Account for ${request.email} approved and activated.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
