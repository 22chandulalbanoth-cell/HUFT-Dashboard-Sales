-- ==============================================================================
-- HUFT SALES DASHBOARD - SUPABASE SECURITY & AUTHENTICATION SCHEMA
-- Multi-Store Role-Based Access Control, Central Admin, and Protected AI Monitoring
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Hyderabad',
    is_active BOOLEAN NOT NULL DEFAULT true,
    ai_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Seed Authorised HUFT Stores
INSERT INTO public.stores (id, name, city, is_active, ai_enabled)
VALUES
    ('Hyderguda', 'HUFT Hyderguda', 'Hyderabad', true, true),
    ('Banjara Hills', 'HUFT Banjara Hills', 'Hyderabad', true, true),
    ('Madhapur', 'HUFT Madhapur', 'Hyderabad', true, true),
    ('Golden Mile', 'HUFT Golden Mile', 'Hyderabad', true, true),
    ('Himayathnagar', 'HUFT Himayathnagar', 'Hyderabad', true, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    city = EXCLUDED.city,
    is_active = EXCLUDED.is_active,
    ai_enabled = EXCLUDED.ai_enabled;

-- 3. PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'store_manager' CHECK (role IN ('admin', 'store_manager', 'store_staff')),
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'deactivated')),
    store_id TEXT REFERENCES public.stores(id) ON UPDATE CASCADE,
    ai_access_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_sign_in_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_store_id ON public.profiles(store_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 4. SECURITY & RLS HELPER FUNCTIONS
-- RULE: ONLY Hyderguda has Central Admin privileges by default; other stores are Store Managers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND store_id = 'Hyderguda' AND status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT store_id FROM public.profiles
    WHERE id = auth.uid() AND status = 'active';
$$;

-- 5. AUDIT & LOGGING TABLES

-- Login Activity Logs
CREATE TABLE IF NOT EXISTS public.user_login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    store_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('login_success', 'login_failed', 'logout', 'session_revoked', 'password_reset_request', 'account_approval', 'account_deactivation')),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user ON public.user_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.user_login_logs(created_at DESC);

-- AI Usage Logs (Anonymized metadata only - strictly no customer PII)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON UPDATE CASCADE,
    prompt_summary TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_store ON public.ai_usage_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage_logs(created_at DESC);

-- Store Aggregated Sales Data (Optional cloud backup with store isolation)
CREATE TABLE IF NOT EXISTS public.store_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON UPDATE CASCADE,
    sale_date DATE NOT NULL,
    retail_sale NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    spa_sale NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_sale NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    food_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    orders_count INTEGER NOT NULL DEFAULT 0,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_store_date UNIQUE (store_id, sale_date)
);

CREATE INDEX IF NOT EXISTS idx_store_sales_lookup ON public.store_sales(store_id, sale_date);

-- 6. AUTOMATIC USER REGISTRATION TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    requested_store TEXT;
    assigned_role TEXT;
    initial_status TEXT;
    is_first_user BOOLEAN;
BEGIN
    requested_store := NEW.raw_user_meta_data->>'store_id';
    
    -- Check if this is the Hyderguda admin account (only Hyderguda has admin by default)
    SELECT NOT EXISTS(SELECT 1 FROM public.profiles) INTO is_first_user;

    IF NEW.email = 'hyderguda@huft.com' OR (requested_store = 'Hyderguda' AND is_first_user) THEN
        assigned_role := 'admin';
        initial_status := 'active';
        requested_store := 'Hyderguda'; -- Hyderguda is the default admin store
    ELSE
        assigned_role := 'store_manager';
        initial_status := 'pending_approval'; -- Requires Central Admin approval
    END IF;

    -- Validate store exists if provided
    IF requested_store IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = requested_store) THEN
        requested_store := 'Hyderguda'; -- Fallback to default store
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, status, store_id, ai_access_enabled)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        assigned_role,
        initial_status,
        requested_store,
        true
    );

    -- Log registration event
    INSERT INTO public.user_login_logs (user_id, user_email, store_id, event_type)
    VALUES (NEW.id, NEW.email, requested_store, 'login_success');

    RETURN NEW;
END;
$$;

-- Trigger firing on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict store isolation and administrative privilege enforcement
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_sales ENABLE ROW LEVEL SECURITY;

-- STORES POLICIES
-- Active users and admins can read store info
CREATE POLICY "stores_select_policy" ON public.stores
    FOR SELECT TO authenticated
    USING (public.is_active_user());

-- Only admins can modify stores
CREATE POLICY "stores_admin_all" ON public.stores
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- PROFILES POLICIES
-- Users can view their own profile; admins can view all profiles
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_admin());

-- Users can update only their own full_name; admins can update all fields (role, status, store, AI access)
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (
        public.is_admin() OR (
            id = auth.uid() AND
            role = (SELECT role FROM public.profiles WHERE id = auth.uid()) AND
            status = (SELECT status FROM public.profiles WHERE id = auth.uid()) AND
            store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid()) AND
            ai_access_enabled = (SELECT ai_access_enabled FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Only admins can delete profiles
CREATE POLICY "profiles_delete_admin" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- USER LOGIN LOGS POLICIES
-- Users can view their own login activity; admins can view all logs
CREATE POLICY "login_logs_select" ON public.user_login_logs
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- Authenticated users can insert their own login events
CREATE POLICY "login_logs_insert" ON public.user_login_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- AI USAGE LOGS POLICIES
-- Store managers can view their store's AI usage; admins can view all
CREATE POLICY "ai_usage_select" ON public.ai_usage_logs
    FOR SELECT TO authenticated
    USING (
        public.is_admin() OR
        (public.is_active_user() AND store_id = public.current_store_id())
    );

-- Authenticated users & edge workers can insert AI usage logs
CREATE POLICY "ai_usage_insert" ON public.ai_usage_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin() OR
        (user_id = auth.uid() AND store_id = public.current_store_id())
    );

-- STORE SALES DATA POLICIES (Store isolation enforced at database level)
-- Users can ONLY access records belonging to their assigned store; admins access all
CREATE POLICY "store_sales_select_isolated" ON public.store_sales
    FOR SELECT TO authenticated
    USING (
        public.is_admin() OR
        (public.is_active_user() AND store_id = public.current_store_id())
    );

CREATE POLICY "store_sales_insert_isolated" ON public.store_sales
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin() OR
        (public.is_active_user() AND store_id = public.current_store_id())
    );

CREATE POLICY "store_sales_update_isolated" ON public.store_sales
    FOR UPDATE TO authenticated
    USING (
        public.is_admin() OR
        (public.is_active_user() AND store_id = public.current_store_id())
    )
    WITH CHECK (
        public.is_admin() OR
        (public.is_active_user() AND store_id = public.current_store_id())
    );
