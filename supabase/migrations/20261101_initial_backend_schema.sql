-- ==============================================================================
-- HUFT SALES DASHBOARD - FULL AUTOMATED BACKEND SUPABASE SCHEMA
-- Multi-Store Role-Based Access Control, Central Admin, Security & Audit Architecture
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id TEXT PRIMARY KEY,
    store_name TEXT NOT NULL,
    store_code TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Designated HUFT Stores
INSERT INTO public.stores (id, store_name, store_code, active)
VALUES
    ('Hyderguda', 'HUFT Hyderguda', 'HYD-01', true),
    ('Banjara Hills', 'HUFT Banjara Hills', 'BH-02', true),
    ('Madhapur', 'HUFT Madhapur', 'MD-03', true),
    ('Golden Mile', 'HUFT Golden Mile', 'GM-04', true),
    ('Himayathnagar', 'HUFT Himayathnagar', 'HN-05', true)
ON CONFLICT (id) DO UPDATE SET
    store_name = EXCLUDED.store_name,
    store_code = EXCLUDED.store_code,
    active = EXCLUDED.active;

-- 3. PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'STORE_USER' CHECK (role IN ('CENTRAL_ADMIN', 'STORE_MANAGER', 'STORE_USER')),
    active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(active);

-- 4. USER_STORE_ACCESS TABLE (Explicit store permissions)
CREATE TABLE IF NOT EXISTS public.user_store_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('ADMIN', 'MANAGER', 'USER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_store UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_usa_user_id ON public.user_store_access(user_id);
CREATE INDEX IF NOT EXISTS idx_usa_store_id ON public.user_store_access(store_id);

-- 5. REGISTRATION_REQUESTS TABLE (Central admin approval queue)
CREATE TABLE IF NOT EXISTS public.registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    store_id TEXT NOT NULL REFERENCES public.stores(id),
    requested_role TEXT NOT NULL CHECK (requested_role IN ('STORE_MANAGER', 'STORE_USER')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_reg_requests_status ON public.registration_requests(status);

-- 6. PASSWORD_RESET_REQUESTS TABLE (Admin-approved recovery)
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'COMPLETED', 'EXPIRED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pwd_resets_status ON public.password_reset_requests(status);

-- 7. LOGIN_ACTIVITY TABLE (Ephemeral session monitoring, 24-hr retention)
CREATE TABLE IF NOT EXISTS public.login_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id TEXT REFERENCES public.stores(id),
    computer_name TEXT,
    login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    logout_time TIMESTAMPTZ,
    session_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (session_status IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'LOGGED_OUT'))
);

CREATE INDEX IF NOT EXISTS idx_login_act_time ON public.login_activity(login_time);

-- 8. USAGE_LOGS TABLE (Ephemeral application activity logs, 24-hr retention)
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id TEXT REFERENCES public.stores(id),
    activity_type TEXT NOT NULL,
    event_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_time ON public.usage_logs(event_time);

-- 9. AI_USAGE_LOGS TABLE (Anonymized AI quota & guardrail monitoring)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id TEXT REFERENCES public.stores(id),
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'groq')),
    model TEXT NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    token_usage INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'RATE_LIMITED', 'ERROR', 'FILTERED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON public.ai_usage_logs(created_at);

-- 10. AUDIT_LOGS TABLE (Permanent security & administrative trail)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON public.audit_logs(created_at);

-- 11. SYSTEM_SETTINGS TABLE (Admin toggles, AI cloud consent, rate limits)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Baseline System Settings
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES
    ('cloud_ai_sales_sharing', '{"enabled": false, "consent_required": true}'::jsonb),
    ('rate_limits', '{"hourly_ai_limit": 25, "max_tokens_per_req": 1000}'::jsonb),
    ('privacy_guardrails', '{"mask_phone": true, "block_customer_names": true}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES & FUNCTIONS
-- ==============================================================================

-- Dynamically ensure RLS is enabled on every table in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Helper Functions (Security Definer with isolated search_path)
CREATE OR REPLACE FUNCTION public.current_profile_active()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT coalesce((SELECT active FROM public.profiles WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.is_central_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'CENTRAL_ADMIN' 
      AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_store_access(target_store TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_central_admin() OR (
    EXISTS (
      SELECT 1 FROM public.user_store_access usa
      WHERE usa.user_id = auth.uid() 
        AND usa.store_id = target_store
    ) AND public.current_profile_active()
  )
$$;

-- RLS: stores (Central Admin or users with explicit store access)
CREATE POLICY "stores_select_policy" ON public.stores
    FOR SELECT TO authenticated
    USING (public.is_central_admin() OR public.has_store_access(id));

-- RLS: profiles (Self read; Central Admin read all & write)
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_central_admin());

CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.is_central_admin())
    WITH CHECK (public.is_central_admin());

-- RLS: user_store_access (Central Admin only or self read assigned stores)
CREATE POLICY "usa_select_policy" ON public.user_store_access
    FOR SELECT TO authenticated
    USING (public.is_central_admin() OR (user_id = auth.uid() AND public.current_profile_active()));

CREATE POLICY "usa_admin_manage" ON public.user_store_access
    FOR ALL TO authenticated
    USING (public.is_central_admin())
    WITH CHECK (public.is_central_admin());

-- RLS: registration_requests (Central Admin only; submissions handled by Edge Function via service role)
CREATE POLICY "reg_requests_admin_policy" ON public.registration_requests
    FOR ALL TO authenticated
    USING (public.is_central_admin())
    WITH CHECK (public.is_central_admin());

-- RLS: password_reset_requests (Central Admin only; submissions handled by Edge Function via service role)
CREATE POLICY "pwd_reset_admin_policy" ON public.password_reset_requests
    FOR ALL TO authenticated
    USING (public.is_central_admin())
    WITH CHECK (public.is_central_admin());

-- RLS: login_activity (Self read/insert; Central Admin reads all)
CREATE POLICY "login_act_insert" ON public.login_activity
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "login_act_select" ON public.login_activity
    FOR SELECT TO authenticated
    USING (public.is_central_admin() OR user_id = auth.uid());

-- RLS: usage_logs (Scoped to verified store access)
CREATE POLICY "usage_logs_insert" ON public.usage_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "usage_logs_select" ON public.usage_logs
    FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));

-- RLS: ai_usage_logs (Scoped to verified store access)
CREATE POLICY "ai_usage_insert" ON public.ai_usage_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_usage_select" ON public.ai_usage_logs
    FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));

-- RLS: audit_logs (Strictly Central Admin access; writes via Edge Functions / Security Definer)
CREATE POLICY "audit_logs_select" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_central_admin());

-- RLS: system_settings (Strictly Central Admin access)
CREATE POLICY "settings_admin_policy" ON public.system_settings
    FOR ALL TO authenticated
    USING (public.is_central_admin())
    WITH CHECK (public.is_central_admin());

-- RLS: rate_limits (Strictly Central Admin access; edge functions use service role)
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT PRIMARY KEY,
    count INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limits_admin_policy" ON public.rate_limits
    FOR ALL TO authenticated
    USING (public.is_central_admin())
    WITH CHECK (public.is_central_admin());

-- ==============================================================================
-- 13. PERMISSIONS & ANONYMOUS ACCESS REVOCATION
-- ==============================================================================

-- Revoke all permissions from anon role
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Grant minimal required permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ==============================================================================
-- 14. AUTOMATIC 24-HOUR RETENTION CLEANUP
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_monitoring_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.login_activity WHERE login_time < (now() - interval '24 hours');
    DELETE FROM public.usage_logs WHERE event_time < (now() - interval '24 hours');
END;
$$;
