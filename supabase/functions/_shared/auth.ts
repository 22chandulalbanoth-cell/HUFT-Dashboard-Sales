// supabase/functions/_shared/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseUserClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const authHeader = req.headers.get('Authorization') || '';
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticateRequest(req: Request) {
  const supabase = getSupabaseUserClient(req);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Unauthorized: Valid Bearer session token required');
  }

  const adminClient = getSupabaseAdmin();
  const { data: profile, error: profError } = await adminClient
    .from('profiles')
    .select('*, user_store_access(store_id, access_level)')
    .eq('id', user.id)
    .single();

  if (profError || !profile || !profile.active) {
    throw new Error('Forbidden: Account inactive or pending Central Admin approval');
  }

  return { user, profile };
}

export function requireCentralAdmin(profile: any) {
  const isHydergudaAdmin = profile.role === 'CENTRAL_ADMIN' && 
    profile.user_store_access?.some((s: any) => s.store_id === 'Hyderguda');
  if (!isHydergudaAdmin) {
    throw new Error('Forbidden: Central Administrator privileges required (Hyderguda store admin)');
  }
}
