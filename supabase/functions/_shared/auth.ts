// supabase/functions/_shared/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { corsHeaders } from './cors.ts';

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

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
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError('Unauthorized: Missing or invalid Bearer authorization header', 401);
  }

  const supabase = getSupabaseUserClient(req);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new HttpError('Unauthorized: Invalid, expired, or revoked session token', 401);
  }

  const adminClient = getSupabaseAdmin();
  const { data: profile, error: profError } = await adminClient
    .from('profiles')
    .select('*, user_store_access(store_id, access_level)')
    .eq('id', user.id)
    .single();

  if (profError || !profile) {
    throw new HttpError('Forbidden: User profile not found in database', 403);
  }

  if (profile.active !== true) {
    throw new HttpError('Forbidden: Account inactive or pending Central Admin approval', 403);
  }

  const stores: string[] = (profile.user_store_access || []).map((s: any) => s.store_id);

  return { user, profile, stores };
}

export function requireCentralAdmin(profile: any) {
  if (profile.role !== 'CENTRAL_ADMIN' || profile.active !== true) {
    throw new HttpError('Forbidden: Central Administrator role required', 403);
  }
}

export function requireStoreAccess(ctx: { profile: any; stores: string[] }, storeId: string) {
  if (ctx.profile.role === 'CENTRAL_ADMIN' && ctx.profile.active === true) {
    return true;
  }
  if (!ctx.stores || !ctx.stores.includes(storeId)) {
    throw new HttpError(`Forbidden: Store access not granted for store '${storeId}'`, 403);
  }
  return true;
}

export function errorResponse(err: any, customCors: Record<string, string> = corsHeaders) {
  let status = 500;
  if (typeof err?.status === 'number') {
    status = err.status;
  } else {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('bearer') || msg.includes('token')) {
      status = 401;
    } else if (msg.includes('forbidden') || msg.includes('denied') || msg.includes('access')) {
      status = 403;
    } else if (msg.includes('required') || msg.includes('invalid') || msg.includes('bad request')) {
      status = 400;
    }
  }

  return new Response(
    JSON.stringify({ ok: false, error: err?.message || 'Internal server error' }),
    { headers: { ...customCors, 'Content-Type': 'application/json' }, status }
  );
}
