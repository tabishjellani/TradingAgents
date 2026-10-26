"""Secure Super Admin & Admin Bootstrap Utility for Supabase.

Promotes an existing registered Supabase user to the 'super_admin' or 'admin' role by updating:
1. auth.users.raw_app_meta_data -> {"role": target_role} (Server-trusted JWT claim)
2. public.profiles -> role = target_role, daily_job_quota = 1000

Security & Safety Features:
- Does NOT create accounts with arbitrary credentials; target user must already exist in auth.users.
- Requires explicit operator confirmation before making state changes (unless --yes flag is passed).
- Never prints or exposes the SUPABASE_SERVICE_ROLE_KEY.
- Idempotent: safe to run multiple times without corrupting metadata or profiles.
- Supports dry-run inspection to preview proposed changes.

Usage:
    python scripts/bootstrap_admin.py --email admin@example.com [--role super_admin] [--dry-run] [--yes]
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import httpx

from backend.app.config import settings


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote an existing registered user to administrator or super administrator.")
    parser.add_argument(
        "--email",
        required=True,
        help="Email address of the existing registered user to promote.",
    )
    parser.add_argument(
        "--role",
        choices=["admin", "super_admin"],
        default="super_admin",
        help="Target privileged role (default: super_admin).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the promotion without making remote changes.",
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Bypass interactive confirmation prompt.",
    )
    return parser.parse_args(args)


def validate_environment() -> tuple[str, str]:
    """Validate that required service role credentials exist."""
    supabase_url = settings.supabase_url or os.environ.get("SUPABASE_URL", "")
    service_key = settings.supabase_service_role_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_url.strip():
        raise RuntimeError(
            "SUPABASE_URL is required to bootstrap an administrator. "
            "Please configure SUPABASE_URL in your server environment / .env file."
        )
    if not service_key or not service_key.strip():
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required to bootstrap an administrator. "
            "Please configure SUPABASE_SERVICE_ROLE_KEY in your server environment / .env file."
        )
    return supabase_url.rstrip("/"), service_key.strip()


async def find_user_by_email(client: httpx.AsyncClient, supabase_url: str, service_key: str, email: str) -> dict[str, Any]:
    """Find a user in auth.users by email using the Supabase Auth Admin API."""
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
    role: str = "admin",
    dry_run: bool = False,
    auto_confirm: bool = True,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Execute the admin or super_admin role assignment against Supabase."""
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
        current_role = current_app_meta.get("role", "user")

        if current_role == role:
            print(f"[INFO] User '{target_email}' already has app_metadata.role = '{role}'. No changes needed.")
            return {"user_id": user_id, "email": target_email, "promoted": False, "already_had_role": True}

        if dry_run:
            print(f"[DRY-RUN] Would assign app_metadata.role = '{role}' to user {target_email} (UUID: {user_id}).")
            print(f"[DRY-RUN] Would update public.profiles role = '{role}' for UUID {user_id}.")
            return {"user_id": user_id, "email": target_email, "promoted": False, "dry_run": True}

        if not auto_confirm and sys.stdin.isatty():
            confirmation = input(f"Confirm promoting user '{target_email}' ({user_id}) to '{role}'? [y/N]: ").strip().lower()
            if confirmation not in ("y", "yes"):
                print("[CANCELLED] Operator aborted bootstrap promotion.")
                return {"user_id": user_id, "email": target_email, "promoted": False, "cancelled": True}

        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        # 1. Update auth.users app_metadata via Supabase Auth Admin API
        update_user_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
        updated_app_meta = {**current_app_meta, "role": role}
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
            json={"role": role, "daily_job_quota": 1000},
        )
        if prof_res.status_code not in (200, 204):
            print(f"[WARNING] Profile sync returned HTTP {prof_res.status_code}: {prof_res.text}")

        print(f"[SUCCESS] User '{target_email}' (UUID: {user_id}) has been promoted to '{role}'.")
        print("[IMPORTANT] Supabase JWT claims are signed upon authentication.")
        print("            The user MUST log out and log back in (or refresh session)")
        print(f"            in the frontend to receive an updated JWT containing the '{role}' claim.")
        return {"user_id": user_id, "email": target_email, "promoted": True, "dry_run": False, "new_role": role}

    finally:
        if should_close_client:
            await client.aclose()


def main():
    args = parse_args()
    import asyncio
    try:
        asyncio.run(
            promote_user_to_admin(
                email=args.email,
                role=args.role,
                dry_run=args.dry_run,
                auto_confirm=args.yes,
            )
        )
    except Exception as exc:
        print(f"[ERROR] Bootstrap failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
