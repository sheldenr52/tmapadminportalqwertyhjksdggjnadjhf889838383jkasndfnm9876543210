-- ============================================================
-- THE MAP — ADMIN SETUP SQL
-- Run this once in your Supabase SQL Editor
-- ============================================================


-- 1. Admin users table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (user_id)
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Admins can view the admin list
CREATE POLICY "Admins can view admin list"
    ON public.admin_users FOR SELECT
    USING (auth.uid() IN (SELECT user_id FROM public.admin_users));


-- 2. is_admin() helper function
-- Used in all admin RLS policies
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- 3. user_profiles view
-- Lets the admin panel safely read auth.users
-- ============================================================
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT
    id,
    email,
    raw_user_meta_data->>'first_name'  AS first_name,
    raw_user_meta_data->>'last_name'   AS last_name,
    raw_user_meta_data->>'full_name'   AS full_name,
    created_at,
    last_sign_in_at,
    confirmed_at
FROM auth.users;

-- Only authenticated users can query the view; RLS restricts to admins
ALTER VIEW public.user_profiles OWNER TO postgres;
REVOKE ALL ON public.user_profiles FROM anon, authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;


-- 4. Admin RLS policy on businesses
-- Admins can read/write every listing
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage all businesses" ON public.businesses;
CREATE POLICY "Admins can manage all businesses" ON public.businesses
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 5. Grant YOUR account admin rights
-- Replace the UUID below with your actual user ID.
-- Find it in: Supabase Dashboard → Authentication → Users
-- ============================================================
-- INSERT INTO public.admin_users (user_id) VALUES ('YOUR-USER-UUID-HERE');
