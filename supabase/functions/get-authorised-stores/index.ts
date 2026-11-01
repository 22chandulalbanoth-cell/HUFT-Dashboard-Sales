import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { profile } = await authenticateRequest(req);
    const adminClient = getSupabaseAdmin();

    const isCentralAdmin = profile.role === 'CENTRAL_ADMIN' &&
      profile.user_store_access?.some((s: any) => s.store_id === 'Hyderguda');

    let stores: any[] = [];
    if (isCentralAdmin) {
      const { data } = await adminClient.from('stores').select('*').eq('active', true).order('store_name');
      stores = data || [];
    } else {
      const assignedIds = profile.user_store_access?.map((s: any) => s.store_id) || [];
      const { data } = await adminClient.from('stores').select('*').in('id', assignedIds).eq('active', true);
      stores = data || [];
    }

    return new Response(
      JSON.stringify({ ok: true, is_central_admin: isCentralAdmin, stores }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
    );
  }
});
