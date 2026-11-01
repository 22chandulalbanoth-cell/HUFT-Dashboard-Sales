import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, getSupabaseAdmin, errorResponse } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { profile, stores: assignedStores } = await authenticateRequest(req);
    const adminClient = getSupabaseAdmin();

    const isCentralAdmin = profile.role === 'CENTRAL_ADMIN' && profile.active === true;

    let stores: any[] = [];
    if (isCentralAdmin) {
      const { data } = await adminClient.from('stores').select('*').eq('active', true).order('store_name');
      stores = data || [];
    } else {
      const { data } = await adminClient.from('stores').select('*').in('id', assignedStores).eq('active', true);
      stores = data || [];
    }

    return new Response(
      JSON.stringify({ ok: true, is_central_admin: isCentralAdmin, stores }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return errorResponse(err, corsHeaders);
  }
});
