-- ============================================================================
-- CENTRAL CONTROL: Enterprise Administration & Security Console
-- Supabase PostgreSQL Database Schema & Security Architecture
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM ('CENTRAL_ADMIN', 'STORE_MANAGER', 'STORE_USER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE account_status_type AS ENUM ('active', 'pending_approval', 'deactivated', 'suspended', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Stores Table
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    manager_name TEXT,
    contact_number TEXT,
    address TEXT,
    logo_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    ai_permission BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles Table (Central Admin is completely independent of any store)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role_type NOT NULL DEFAULT 'STORE_MANAGER',
    status account_status_type NOT NULL DEFAULT 'active',
    store_code TEXT REFERENCES public.stores(code) ON DELETE SET NULL,
    avatar_url TEXT,
    ai_access_enabled BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    last_login_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registration Approvals Queue
CREATE TABLE IF NOT EXISTS public.registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    requested_store_code TEXT REFERENCES public.stores(code) ON DELETE SET NULL,
    requested_role user_role_type NOT NULL DEFAULT 'STORE_MANAGER',
    status account_status_type NOT NULL DEFAULT 'pending_approval',
    review_notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permanent Immutable Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    affected_account TEXT,
    affected_store TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    result TEXT NOT NULL DEFAULT 'SUCCESS'
);

-- Login Activity (Telemetry - 24h Retention)
CREATE TABLE IF NOT EXISTS public.login_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    user_name TEXT,
    store_code TEXT,
    device_name TEXT,
    browser TEXT,
    operating_system TEXT,
    ip_address TEXT,
    session_id TEXT,
    event_type TEXT NOT NULL,
    is_active_session BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Software Usage Telemetry (24h Retention, strictly software events)
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    store_code TEXT,
    user_email TEXT,
    event_name TEXT NOT NULL,
    app_version TEXT,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Usage Logs & Rate Limiting
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    store_code TEXT,
    user_email TEXT,
    provider TEXT NOT NULL DEFAULT 'GEMINI',
    prompt_summary TEXT,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System Settings
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_store ON public.profiles(store_code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_activity_timestamp ON public.login_activity(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON public.usage_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON public.ai_usage_logs(timestamp DESC);

-- Security Functions
CREATE OR REPLACE FUNCTION public.is_central_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
          AND role = 'CENTRAL_ADMIN' 
          AND status = 'active'
    );
END;
$$;

-- Telemetry Purge Routine
CREATE OR REPLACE FUNCTION public.purge_temporary_telemetry()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_rows INTEGER := 0;
    count_login INTEGER;
    count_usage INTEGER;
BEGIN
    DELETE FROM public.login_activity 
    WHERE created_at < NOW() - INTERVAL '24 hours' 
      AND is_active_session = false;
    GET DIAGNOSTICS count_login = ROW_COUNT;

    DELETE FROM public.usage_logs 
    WHERE created_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS count_usage = ROW_COUNT;

    deleted_rows := count_login + count_usage;
    RETURN deleted_rows;
END;
$$;

-- RLS Enforcement
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_requests TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.login_activity TO authenticated;
GRANT SELECT, INSERT ON public.usage_logs TO authenticated;
GRANT SELECT, INSERT ON public.ai_usage_logs TO authenticated;
GRANT SELECT, UPDATE ON public.system_settings TO authenticated;
GRANT SELECT ON public.stores TO anon;
