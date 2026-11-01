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
      .from('password_reset_requests')
      .select('*, profiles(email)')
      .eq('id', request_id)
      .single();

    if (reqError || !request) throw new Error('Reset request not found');

    const email = request.profiles?.email;
    if (!email) throw new Error('User email not found for reset request');

    // Generate recovery link using Supabase Admin Auth
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    if (linkError) throw linkError;

    // Update request record
    await adminClient.from('password_reset_requests').update({
      status: 'APPROVED',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', request_id);

    await adminClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'APPROVE_PASSWORD_RESET',
      resource: `User: ${email}`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Password reset approved for ${email}.`,
        recovery_url: linkData?.properties?.action_link,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
