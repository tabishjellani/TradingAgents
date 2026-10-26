-- ============================================================================
-- Migration 005: Least-Privilege Hardening & Table Grant Cleanup
--
-- Enforces strict least privilege across public.profiles, public.audit_events,
-- and public.usage_ledger:
-- 1. Revokes table-level and column-level privileges (DELETE, TRUNCATE, TRIGGER,
--    REFERENCES, INSERT, UPDATE) from anon, authenticated, and PUBLIC.
-- 2. Revokes CREATE on schema public from anon, authenticated, and PUBLIC to
--    protect SECURITY DEFINER trigger execution against schema-injection attacks.
-- 3. Grants authenticated users SELECT only on profiles, audit_events, and
--    usage_ledger, plus column-level UPDATE exclusively on profiles(email, updated_at).
-- 4. Tightens usage_ledger INSERT policy so only service_role can append records.
-- 5. Re-affirms full table access for service_role across all three tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema-Level Hardening (Protects SECURITY DEFINER triggers)
-- ----------------------------------------------------------------------------

-- Ensure unprivileged client roles cannot create objects in schema public
REVOKE CREATE ON SCHEMA public FROM anon, authenticated, PUBLIC;


-- ----------------------------------------------------------------------------
-- 2. Hardening public.profiles
-- ----------------------------------------------------------------------------

-- Strip all table-level privileges from anon, authenticated, and PUBLIC
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated, PUBLIC;

-- Explicitly revoke all column-level privileges across all columns for defense-in-depth
-- (In PostgreSQL, table-level REVOKE removes corresponding column grants, but explicit
-- column revocation ensures an unambiguous zero-privilege baseline).
REVOKE ALL (id, email, role, daily_job_quota, created_at, updated_at) ON TABLE public.profiles FROM anon, authenticated, PUBLIC;

-- Grant minimal required privileges:
-- Authenticated users can SELECT rows (governed by RLS: own row or admin view all)
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Authenticated users can UPDATE ONLY non-sensitive columns (email, updated_at)
GRANT UPDATE (email, updated_at) ON TABLE public.profiles TO authenticated;

-- Service role retains full administrative access
GRANT ALL ON TABLE public.profiles TO service_role;


-- ----------------------------------------------------------------------------
-- 3. Hardening public.audit_events
-- ----------------------------------------------------------------------------

-- Strip all table-level privileges from anon, authenticated, and PUBLIC
REVOKE ALL ON TABLE public.audit_events FROM anon, authenticated, PUBLIC;

-- Explicitly revoke any column-level privileges
REVOKE ALL (id, actor_id, action, resource_type, resource_id, ip_address, details, created_at) ON TABLE public.audit_events FROM anon, authenticated, PUBLIC;

-- Authenticated users can only SELECT rows (governed by RLS: admins only)
GRANT SELECT ON TABLE public.audit_events TO authenticated;

-- Service role retains full access for server-side audit logging
GRANT ALL ON TABLE public.audit_events TO service_role;


-- ----------------------------------------------------------------------------
-- 4. Hardening public.usage_ledger
-- ----------------------------------------------------------------------------

-- Strip all table-level privileges from anon, authenticated, and PUBLIC
REVOKE ALL ON TABLE public.usage_ledger FROM anon, authenticated, PUBLIC;

-- Explicitly revoke any column-level privileges
REVOKE ALL (id, user_id, action_type, tokens_used, estimated_cost_usd, created_at) ON TABLE public.usage_ledger FROM anon, authenticated, PUBLIC;

-- Authenticated users can only SELECT rows (governed by RLS: own records only)
GRANT SELECT ON TABLE public.usage_ledger TO authenticated;

-- Service role retains full access for recording usage metrics
GRANT ALL ON TABLE public.usage_ledger TO service_role;

-- Tighten RLS: drop client insert policy and restrict INSERT strictly to service_role
DROP POLICY IF EXISTS "Service can insert usage records" ON public.usage_ledger;
DROP POLICY IF EXISTS "Service role can insert usage records" ON public.usage_ledger;

CREATE POLICY "Service role can insert usage records"
ON public.usage_ledger FOR INSERT
TO service_role
WITH CHECK (true);
