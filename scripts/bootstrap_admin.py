"""Secure One-Time Admin Bootstrap Script for Supabase.

Promotes a registered Supabase user to the 'admin' role by updating:
1. auth.users.raw_app_meta_data -> {"role": "admin"} (Server-trusted JWT claim)
2. public.profiles -> role = 'admin', daily_job_quota = 1000

Requirements:
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the server environment / .env.
- The target user MUST have registered an account beforehand (email must exist in auth.users).
- NEVER expose SUPABASE_SERVICE_ROLE_KEY to the frontend or check into version control.
- After running, the administrator MUST log out and log back in (or refresh session)
  to receive an updated JWT containing the 'app_metadata.role: admin' claim.

Usage:
    python scripts/bootstrap_admin.py --email admin@example.com [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import httpx

from backend.app.config import settings


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote an existing registered user to administrator.")
    parser.add_argument(
        "--email",
        required=True,
        help="Email address of the existing registered user to promote to admin.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the promotion without making changes.",
    )
    return parser.parse_args(args)


def validate_environment() -> tuple[str, str]:
    """Validate that required service role credentials exist."""
    supabase_url = settings.supabase_url or os.environ.get("SUPABASE_URL", "")
    service_key = settings.supabase_service_role_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_url.strip():
        raise RuntimeError(
            "SUPABASE_URL is required to bootstrap an admin user. "
            "Please configure SUPABASE_URL in your server .env file."
        )
    if not service_key or not service_key.strip():
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required to bootstrap an admin user. "
            "Please configure SUPABASE_SERVICE_ROLE_KEY in your server .env file."
        )
    return supabase_url.rstrip("/"), service_key.strip()


async def find_user_by_email(client: httpx.AsyncClient, supabase_url: str, service_key: str, email: str) -> dict[str, Any]:
    """Find a user in auth.users by email using the Supabase Admin Auth API."""
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    url = f"{supabase_url}/auth/v1/admin/users"
    res = await client.get(url, headers=headers, params={"per_page": 100})
    if res.status_code != 200:
        raise RuntimeError(f"Failed to query Supabase Auth Admin API: HTTP {res.status_code} - {res.text}")

    users = res.json().get("users", [])
    target = next((u for u in users if u.get("email", "").lower() == email.lower()), None)
    if not target:
        raise ValueError(
            f"User with email '{email}' was not found in auth.users. "
            "The administrator must first sign up/register an account through "
            "the frontend application before the admin role can be assigned."
        )
    return target


async def promote_user_to_admin(
    email: str,
    dry_run: bool = False,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Execute the admin role assignment against Supabase."""
    supabase_url, service_key = validate_environment()
    target_email = email.strip().lower()

    should_close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=15.0)
        should_close_client = True

    try:
        user = await find_user_by_email(client, supabase_url, service_key, target_email)
        user_id = user["id"]

        current_app_meta = user.get("app_metadata", {})
        if current_app_meta.get("role") == "admin":
            print(f"[INFO] User '{target_email}' already has app_metadata.role = 'admin'.")

        if dry_run:
            print(f"[DRY-RUN] Would assign app_metadata.role = 'admin' to user {target_email} (UUID: {user_id}).")
            print(f"[DRY-RUN] Would update public.profiles role = 'admin' for UUID {user_id}.")
            return {"user_id": user_id, "email": target_email, "promoted": False, "dry_run": True}

        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        # 1. Update auth.users app_metadata via Supabase Auth Admin API
        update_user_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
        updated_app_meta = {**current_app_meta, "role": "admin"}
        user_res = await client.put(
            update_user_url,
            headers=headers,
            json={"app_metadata": updated_app_meta},
        )
        if user_res.status_code not in (200, 204):
            raise RuntimeError(f"Failed to update auth.users metadata: HTTP {user_res.status_code} - {user_res.text}")

        # 2. Update public.profiles row via PostgREST using service_role
        profile_url = f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}"
        prof_res = await client.patch(
            profile_url,
            headers=headers,
            json={"role": "admin", "daily_job_quota": 1000},
        )
        if prof_res.status_code not in (200, 204):
            # Non-fatal if profile sync fails, but log warning
            print(f"[WARNING] Profile sync returned HTTP {prof_res.status_code}: {prof_res.text}")

        print(f"[SUCCESS] User '{target_email}' (UUID: {user_id}) has been promoted to 'admin'.")
        print("[IMPORTANT] Supabase JWT claims are signed upon authentication.")
        print("            The user MUST log out and log back in (or refresh session)")
        print("            in the frontend to receive an updated JWT containing the admin claim.")
        return {"user_id": user_id, "email": target_email, "promoted": True, "dry_run": False}

    finally:
        if should_close_client:
            await client.aclose()


def main():
    args = parse_args()
    import asyncio
    try:
        asyncio.run(promote_user_to_admin(args.email, dry_run=args.dry_run))
    except Exception as exc:
        print(f"[ERROR] Bootstrap failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
