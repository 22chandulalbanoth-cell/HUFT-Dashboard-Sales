import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { email } = await req.json();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Valid email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const adminClient = getSupabaseAdmin();
    const { data: profile } = await adminClient.from('profiles').select('id').eq('email', cleanEmail).single();

    if (profile) {
      await adminClient.from('password_reset_requests').insert({
        user_id: profile.id,
        status: 'PENDING',
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Password reset request submitted. A Central Administrator will review and authorize your reset.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err);
  }
});
