import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { email, store_id, requested_role } = await req.json();
    if (!email || !store_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Email and store_id are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const cleanRole = requested_role === 'STORE_MANAGER' ? 'STORE_MANAGER' : 'STORE_USER';
    const adminClient = getSupabaseAdmin();

    const { data, error } = await adminClient.from('registration_requests').insert({
      email: String(email).trim().toLowerCase(),
      store_id: store_id,
      requested_role: cleanRole,
      status: 'PENDING',
    }).select().single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Registration request submitted successfully. Awaiting Central Admin approval.',
        data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
