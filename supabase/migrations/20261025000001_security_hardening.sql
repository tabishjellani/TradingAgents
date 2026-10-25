-- ============================================================================
-- Migration 004: Security Hardening & Privilege Isolation
-- Closes vulnerabilities identified in Critical Supabase Security Review:
-- 1. SEC-03: Revokes client direct INSERT on public.profiles to prevent self-service
--    role escalation or quota inflation. Profiles are managed exclusively by
--    the SECURITY DEFINER signup trigger (public.handle_new_user).
-- 2. SEC-01 & SEC-04: Restricts client UPDATE privileges on public.profiles to
--    non-sensitive columns (email, updated_at), enforcing defense-in-depth.
-- 3. SEC-05 & SEC-06: Drops permissive INSERT on public.audit_events, revokes
--    write access from anon/authenticated roles, and enforces that audit trail
--    entries can only be created by trusted server-side code (service_role).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hardening public.profiles
-- ----------------------------------------------------------------------------

-- Drop the permissive insert policy that allowed client-supplied role/quota values
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Revoke direct table-level INSERT from anonymous and authenticated client roles.
-- The auth signup trigger (handle_new_user) runs with SECURITY DEFINER and
-- continues to insert default user profiles safely upon auth.users creation.
REVOKE INSERT ON public.profiles FROM anon, authenticated;

-- Revoke full table UPDATE, then grant column-level UPDATE only on non-sensitive columns
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (email, updated_at) ON public.profiles TO authenticated;

-- Ensure service_role maintains full administrative permissions for background tasks
GRANT ALL ON public.profiles TO service_role;

-- Recreate defense-in-depth UPDATE policy on public.profiles
DROP POLICY IF EXISTS "Users can update own profile non-privileged fields" ON public.profiles;
CREATE POLICY "Users can update own profile non-privileged fields"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR (role = 'user' AND daily_job_quota <= 20)
    )
);

-- ----------------------------------------------------------------------------
-- 2. Hardening public.audit_events
-- ----------------------------------------------------------------------------

-- Drop the vulnerable policy that permitted any authenticated user to insert audit logs
DROP POLICY IF EXISTS "Authenticated users and service can insert audit events" ON public.audit_events;

-- Explicitly revoke all client-side write permissions on the audit log table
REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM anon, authenticated;

-- Ensure service_role has full table privileges to append audit trail records
GRANT ALL ON public.audit_events TO service_role;

-- Re-affirm SELECT policy: Only authenticated admins can read audit events
DROP POLICY IF EXISTS "Admins can view audit events" ON public.audit_events;
CREATE POLICY "Admins can view audit events"
ON public.audit_events FOR SELECT
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Permitted INSERT policy exclusively for service_role
DROP POLICY IF EXISTS "Service role can insert audit events" ON public.audit_events;
CREATE POLICY "Service role can insert audit events"
ON public.audit_events FOR INSERT
TO service_role
WITH CHECK (true);
