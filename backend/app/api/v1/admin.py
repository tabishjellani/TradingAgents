"""Admin API endpoints protected by server-side RBAC."""

from __future__ import annotations

import contextlib
import time
from datetime import UTC, datetime
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.auth import UserClaims, require_admin, require_super_admin
from backend.app.config import settings
from backend.app.core.secrets_vault import SUPPORTED_PROVIDERS, vault
from backend.app.db.repository import db_repo
from backend.app.services.market_data import market_service

router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])

PROVIDER_METADATA: dict[str, dict[str, Any]] = {
    "google": {
        "name": "Google Gemini",
        "description": "Zero-cost provider with generous free-tier (15 RPM).",
        "verified_quick_models": ["gemini-2.0-flash", "gemini-1.5-flash"],
        "verified_deep_models": ["gemini-2.0-flash", "gemini-1.5-pro"],
        "unverified_catalog_models": ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
        "quick_models": ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
        "deep_models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-3.8-flash", "gemini-3.1-pro-preview"],
        "default_quick": "gemini-2.0-flash",
        "default_deep": "gemini-2.0-flash",
    },
    "openai": {
        "name": "OpenAI",
        "description": "Frontier models for quantitative debate and reasoning.",
        "verified_quick_models": ["gpt-4o-mini", "gpt-4o"],
        "verified_deep_models": ["gpt-4o", "o1", "o1-mini"],
        "unverified_catalog_models": ["gpt-6-luna", "gpt-6-sol", "gpt-5.6-luna"],
        "quick_models": ["gpt-4o-mini", "gpt-4o", "gpt-6-luna", "gpt-5.6-luna"],
        "deep_models": ["gpt-4o", "o1", "o1-mini", "gpt-6-sol"],
        "default_quick": "gpt-4o-mini",
        "default_deep": "gpt-4o",
    },
    "groq": {
        "name": "Groq Cloud",
        "description": "Ultra-fast low-latency Llama inference with free developer preview.",
        "verified_quick_models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
        "verified_deep_models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
        "unverified_catalog_models": [],
        "quick_models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
        "deep_models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
        "default_quick": "llama-3.3-70b-versatile",
        "default_deep": "llama-3.3-70b-versatile",
    },
    "anthropic": {
        "name": "Anthropic Claude",
        "description": "Claude frontier intelligence for investment research synthesis.",
        "verified_quick_models": ["claude-3-5-haiku-latest", "claude-3-5-haiku-20241022"],
        "verified_deep_models": ["claude-3-5-sonnet-latest", "claude-3-5-sonnet-20241022", "claude-3-opus-latest"],
        "unverified_catalog_models": ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5-5"],
        "quick_models": ["claude-3-5-haiku-latest", "claude-3-5-haiku-20241022", "claude-haiku-4-5"],
        "deep_models": ["claude-3-5-sonnet-latest", "claude-3-5-sonnet-20241022", "claude-sonnet-5", "claude-opus-5-5"],
        "default_quick": "claude-3-5-haiku-latest",
        "default_deep": "claude-3-5-sonnet-latest",
    },
}


class UpdateQuotaRequest(BaseModel):
    daily_job_quota: int = Field(ge=1, le=1000)


class SetProviderKeyRequest(BaseModel):
    provider: str
    api_key: str = Field(min_length=8, description="API key to store in encrypted vault")


class UpdateAiConfigRequest(BaseModel):
    default_ai_provider: str
    default_quick_model: str
    default_deep_model: str


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str | None = None
    model: str | None = None


@router.get("/telemetry")
async def get_system_telemetry(
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Retrieve system telemetry and resource limits."""
    return {
        "admin_user": admin.email,
        "environment": settings.environment,
        "live_trading_enabled": settings.enable_live_trading,
        "quotas": {
            "daily_job_quota": settings.user_daily_job_quota,
            "max_job_timeout_seconds": settings.max_job_timeout_seconds,
            "max_order_notional_usd": settings.max_order_notional_usd,
        },
        "ai_providers": {
            "default": settings.default_ai_provider,
            "quick_model": settings.default_quick_model,
            "deep_model": settings.default_deep_model,
        },
        "server_timestamp": datetime.now(UTC).isoformat(),
    }


@router.post("/quotas")
async def update_global_quota(
    req: UpdateQuotaRequest,
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Update global daily job quota."""
    settings.user_daily_job_quota = req.daily_job_quota
    await db_repo.record_audit_event(
        actor_id=admin.id,
        action="global_quota_updated",
        resource_type="system_quota",
        resource_id="daily_job_quota",
        details={"new_daily_job_quota": req.daily_job_quota},
    )
    return {
        "updated_by": admin.email,
        "new_daily_job_quota": settings.user_daily_job_quota,
    }


@router.get("/audit-logs")
async def get_audit_trail(
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> list[dict[str, Any]]:
    """Retrieve append-only audit trail."""
    events = await db_repo.get_audit_events(limit=50, token=admin.token)
    if not events:
        return [
            {
                "id": "aud-init",
                "action": "SYSTEM_STARTUP",
                "actor": "System",
                "timestamp": datetime.now(UTC).isoformat(),
                "status": "SUCCESS",
            }
        ]
    return [
        {
            "id": e.get("id"),
            "action": e.get("action"),
            "actor": e.get("actor_id") or "System",
            "resource_type": e.get("resource_type"),
            "resource_id": e.get("resource_id"),
            "timestamp": e.get("created_at"),
            "details": e.get("details", {}),
            "status": "SUCCESS",
        }
        for e in events
    ]


# -----------------------------------------------------------------------------
# AI Provider & Encrypted Secrets Management (Admin-Only)
# -----------------------------------------------------------------------------


@router.get("/ai-providers")
async def list_ai_providers(
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """List all supported AI providers, their configuration state, and models."""
    providers_list = []
    for pid, meta in PROVIDER_METADATA.items():
        st = vault.get_provider_status(pid)
        is_active = (settings.default_ai_provider.lower() == pid)
        providers_list.append({
            "id": pid,
            "name": meta["name"],
            "description": meta["description"],
            "is_active": is_active,
            "configured": st["configured"],
            "masked_key": st["masked_key"],
            "source": st["source"],
            "quick_models": meta["quick_models"],
            "deep_models": meta["deep_models"],
            "verified_quick_models": meta.get("verified_quick_models", []),
            "verified_deep_models": meta.get("verified_deep_models", []),
            "unverified_catalog_models": meta.get("unverified_catalog_models", []),
            "current_quick_model": settings.default_quick_model if is_active else meta["default_quick"],
            "current_deep_model": settings.default_deep_model if is_active else meta["default_deep"],
        })

    return {
        "active_provider": settings.default_ai_provider,
        "quick_model": settings.default_quick_model,
        "deep_model": settings.default_deep_model,
        "providers": providers_list,
    }


@router.post("/ai-providers/keys")
async def set_ai_provider_key(
    req: SetProviderKeyRequest,
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Securely encrypt and store a provider API key in server-side storage."""
    p_lower = req.provider.lower()
    if p_lower not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{req.provider}'. Supported: {SUPPORTED_PROVIDERS}",
        )

    try:
        vault.set_provider_key(p_lower, req.api_key)
        st = vault.get_provider_status(p_lower)
        await db_repo.record_audit_event(
            actor_id=admin.id,
            action="ai_key_saved",
            resource_type="secrets_vault",
            resource_id=p_lower,
            details={"provider": p_lower, "source": st["source"]},
        )
        return {
            "success": True,
            "provider": p_lower,
            "masked_key": st["masked_key"],
            "source": st["source"],
            "message": f"Successfully encrypted and saved API key for {p_lower.title()}.",
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete("/ai-providers/keys/{provider}")
async def delete_ai_provider_key(
    provider: str,
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Remove a provider API key from the encrypted vault and process environment."""
    p_lower = provider.lower()
    if p_lower not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{provider}'. Supported: {SUPPORTED_PROVIDERS}",
        )

    removed = vault.remove_provider_key(p_lower)
    await db_repo.record_audit_event(
        actor_id=admin.id,
        action="ai_key_deleted",
        resource_type="secrets_vault",
        resource_id=p_lower,
        details={"provider": p_lower, "removed": removed},
    )
    return {
        "success": True,
        "provider": p_lower,
        "removed": removed,
        "message": f"API key cleared for {p_lower.title()}.",
    }


@router.post("/ai-providers/config")
async def update_ai_config(
    req: UpdateAiConfigRequest,
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Update active AI provider and quick/deep models with schema validation."""
    p_lower = req.default_ai_provider.lower()
    if p_lower not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider '{req.default_ai_provider}' is not supported.",
        )

    meta = PROVIDER_METADATA.get(p_lower, {})
    valid_quick = meta.get("quick_models", [])
    valid_deep = meta.get("deep_models", [])

    if req.default_quick_model not in valid_quick:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid quick model '{req.default_quick_model}' for provider {p_lower}. Allowed: {valid_quick}",
        )

    if req.default_deep_model not in valid_deep:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid deep model '{req.default_deep_model}' for provider {p_lower}. Allowed: {valid_deep}",
        )

    settings.default_ai_provider = p_lower
    settings.default_quick_model = req.default_quick_model
    settings.default_deep_model = req.default_deep_model

    await db_repo.record_audit_event(
        actor_id=admin.id,
        action="ai_config_updated",
        resource_type="model_config",
        resource_id=p_lower,
        details={
            "provider": p_lower,
            "quick_model": req.default_quick_model,
            "deep_model": req.default_deep_model,
        },
    )

    return {
        "success": True,
        "default_ai_provider": settings.default_ai_provider,
        "default_quick_model": settings.default_quick_model,
        "default_deep_model": settings.default_deep_model,
        "message": f"Active AI provider updated to {p_lower.title()}.",
    }


@router.post("/ai-providers/test-connection")
async def test_ai_provider_connection(
    req: TestConnectionRequest,
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Safely test credentials and connectivity with an AI provider."""
    p_lower = req.provider.lower()
    if p_lower not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{req.provider}'. Supported: {SUPPORTED_PROVIDERS}",
        )

    api_key = req.api_key.strip() if req.api_key else vault.get_provider_key(p_lower)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key provided or configured for {p_lower.title()}. Please enter or save a key first.",
        )

    start = time.perf_counter()

    try:
        if p_lower == "google":
            # Test Gemini metadata models endpoint using header to prevent URL leakage
            url = "https://generativelanguage.googleapis.com/v1beta/models"
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, headers={"x-goog-api-key": api_key})
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "provider": p_lower,
                        "message": "Successfully authenticated with Google Gemini API.",
                        "latency_ms": latency,
                    }
                detail = "API key rejected or unauthorized by Google."
                with contextlib.suppress(Exception):
                    err_json = res.json().get("error", {})
                    detail = err_json.get("message", detail)
                if api_key in detail:
                    detail = detail.replace(api_key, "[REDACTED_KEY]")
                return {
                    "success": False,
                    "provider": p_lower,
                    "message": f"Google authentication failed: {detail}",
                    "latency_ms": latency,
                }

        elif p_lower == "openai":
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "provider": p_lower,
                        "message": "Successfully authenticated with OpenAI API.",
                        "latency_ms": latency,
                    }
                return {
                    "success": False,
                    "provider": p_lower,
                    "message": f"OpenAI authentication failed (HTTP {res.status_code}). Check your key.",
                    "latency_ms": latency,
                }

        elif p_lower == "groq":
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "provider": p_lower,
                        "message": "Successfully authenticated with Groq Cloud API.",
                        "latency_ms": latency,
                    }
                return {
                    "success": False,
                    "provider": p_lower,
                    "message": f"Groq authentication failed (HTTP {res.status_code}). Check your key.",
                    "latency_ms": latency,
                }

        elif p_lower == "anthropic":
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                )
                latency = int((time.perf_counter() - start) * 1000)
                if res.status_code == 200:
                    return {
                        "success": True,
                        "provider": p_lower,
                        "message": "Successfully authenticated with Anthropic API.",
                        "latency_ms": latency,
                    }
                return {
                    "success": False,
                    "provider": p_lower,
                    "message": f"Anthropic authentication failed (HTTP {res.status_code}). Check your key.",
                    "latency_ms": latency,
                }

    except Exception as exc:
        latency = int((time.perf_counter() - start) * 1000)
        clean_msg = str(exc)
        if api_key and api_key in clean_msg:
            clean_msg = clean_msg.replace(api_key, "[REDACTED_KEY]")
        return {
            "success": False,
            "provider": p_lower,
            "message": f"Connection test failed: {clean_msg}",
            "latency_ms": latency,
        }

    return {
        "success": False,
        "provider": p_lower,
        "message": f"Unknown provider '{p_lower}'.",
        "latency_ms": None,
    }


# -----------------------------------------------------------------------------
# User Management & Super Admin Endpoints
# -----------------------------------------------------------------------------


class UpdateUserRoleRequest(BaseModel):
    role: str = Field(pattern="^(user|operator|admin|super_admin)$")


class UpdateUserStatusRequest(BaseModel):
    is_banned: bool


class AdminUserInfo(BaseModel):
    id: str
    email: str
    role: str
    created_at: str
    last_sign_in_at: str | None = None
    is_banned: bool = False
    confirmed_at: str | None = None


class AdminUserListResponse(BaseModel):
    users: list[AdminUserInfo]
    total: int
    page: int
    per_page: int


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    admin: Annotated[UserClaims, Depends(require_admin)],
    search: str = "",
    page: int = 1,
    per_page: int = 25,
) -> AdminUserListResponse:
    """List registered users with pagination and search. Requires admin or super_admin."""
    # When Supabase is configured with service_role_key, query Supabase Auth Admin API
    if settings.supabase_url and settings.supabase_service_role_key:
        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
        }
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=headers, params={"page": page, "per_page": per_page})
                if res.status_code == 200:
                    raw_users = res.json().get("users", [])
                    user_items: list[AdminUserInfo] = []
                    for u in raw_users:
                        email = u.get("email", "")
                        if search and search.lower() not in email.lower() and search not in u.get("id", ""):
                            continue
                        app_meta = u.get("app_metadata", {})
                        user_items.append(
                            AdminUserInfo(
                                id=u.get("id"),
                                email=email,
                                role=app_meta.get("role", "user"),
                                created_at=u.get("created_at", ""),
                                last_sign_in_at=u.get("last_sign_in_at"),
                                is_banned=bool(u.get("banned_until")),
                                confirmed_at=u.get("confirmed_at"),
                            )
                        )
                    return AdminUserListResponse(
                        users=user_items,
                        total=len(user_items),
                        page=page,
                        per_page=per_page,
                    )
        except Exception as exc:
            logger.warning("Could not list remote Supabase users: %s", exc)

    # Offline / development fallback from local database store
    users_data: list[AdminUserInfo] = [
        AdminUserInfo(
            id=admin.id,
            email=admin.email,
            role=admin.role,
            created_at=datetime.now(UTC).isoformat(),
            last_sign_in_at=datetime.now(UTC).isoformat(),
            is_banned=False,
            confirmed_at=datetime.now(UTC).isoformat(),
        ),
    ]
    if search:
        users_data = [u for u in users_data if search.lower() in u.email.lower() or search in u.id]

    return AdminUserListResponse(
        users=users_data,
        total=len(users_data),
        page=page,
        per_page=per_page,
    )


@router.post("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    req: UpdateUserRoleRequest,
    super_admin: Annotated[UserClaims, Depends(require_super_admin)],
) -> dict[str, Any]:
    """Assign or modify a user's role. Restricted strictly to Super Administrators."""
    target_role = req.role

    # Prevent accidental self-demotion from super_admin to lock out the system
    if user_id == super_admin.id and target_role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super administrators cannot demote their own account to prevent lockout.",
        )

    # Update in Supabase Auth if configured
    if settings.supabase_url and settings.supabase_service_role_key:
        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Fetch current app_metadata
            get_res = await client.get(url, headers=headers)
            if get_res.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Target user '{user_id}' not found.",
                )
            user_data = get_res.json()
            app_meta = user_data.get("app_metadata", {})
            updated_meta = {**app_meta, "role": target_role}

            # 2. Update app_metadata
            put_res = await client.put(url, headers=headers, json={"app_metadata": updated_meta})
            if put_res.status_code not in (200, 204):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update role in Supabase Auth.",
                )

            # 3. Update public.profiles row
            profile_url = f"{settings.supabase_url.rstrip('/')}/rest/v1/profiles?id=eq.{user_id}"
            await client.patch(profile_url, headers=headers, json={"role": target_role})

    # Record audit event
    await db_repo.record_audit_event(
        actor_id=super_admin.id,
        action="user_role_changed",
        resource_type="auth_user",
        resource_id=user_id,
        details={"new_role": target_role, "changed_by": super_admin.email},
    )

    return {
        "success": True,
        "user_id": user_id,
        "new_role": target_role,
        "updated_by": super_admin.email,
        "message": f"Successfully updated user role to '{target_role}'.",
    }


@router.post("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    req: UpdateUserStatusRequest,
    super_admin: Annotated[UserClaims, Depends(require_super_admin)],
) -> dict[str, Any]:
    """Disable or suspend an account. Restricted strictly to Super Administrators."""
    if user_id == super_admin.id and req.is_banned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super administrators cannot suspend their own account.",
        )

    if settings.supabase_url and settings.supabase_service_role_key:
        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
        # Setting ban_duration to "876000h" (~100 years) or "none"
        ban_duration = "876000h" if req.is_banned else "none"
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.put(url, headers=headers, json={"ban_duration": ban_duration})
            if res.status_code not in (200, 204):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update user ban status in Supabase.",
                )

    await db_repo.record_audit_event(
        actor_id=super_admin.id,
        action="user_status_changed",
        resource_type="auth_user",
        resource_id=user_id,
        details={"is_banned": req.is_banned, "changed_by": super_admin.email},
    )

    return {
        "success": True,
        "user_id": user_id,
        "is_banned": req.is_banned,
        "message": "User account suspended." if req.is_banned else "User account re-enabled.",
    }


@router.get("/market-status")
async def get_admin_market_status(
    _admin: Annotated[UserClaims, Depends(require_admin)],
) -> dict[str, Any]:
    """Retrieve detailed market data diagnostics for the administration console."""
    status_obj = market_service.get_provider_status()
    return status_obj.model_dump()
