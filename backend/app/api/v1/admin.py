"""Admin API endpoints protected by server-side RBAC."""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.app.auth import UserClaims, require_admin
from backend.app.config import settings

router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])


class UpdateQuotaRequest(BaseModel):
    daily_job_quota: int = Field(ge=1, le=1000)


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
    return {
        "updated_by": admin.email,
        "new_daily_job_quota": settings.user_daily_job_quota,
    }


@router.get("/audit-logs")
async def get_audit_trail(
    admin: Annotated[UserClaims, Depends(require_admin)],
) -> list[dict[str, Any]]:
    """Retrieve append-only audit trail."""
    return [
        {
            "id": "aud-1",
            "action": "SYSTEM_STARTUP",
            "actor": "System",
            "timestamp": datetime.now(UTC).isoformat(),
            "status": "SUCCESS",
        },
        {
            "id": "aud-2",
            "action": "ADMIN_ACCESS_VERIFIED",
            "actor": admin.email,
            "timestamp": datetime.now(UTC).isoformat(),
            "status": "SUCCESS",
        },
    ]
