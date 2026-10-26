-- Migration 006: Harden the auth user creation trigger function.
-- Mirrors the hardening already applied and tested in staging.

ALTER FUNCTION public.handle_new_user()
    SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
    FROM PUBLIC, anon, authenticated;
