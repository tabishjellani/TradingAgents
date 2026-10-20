"""TradingAgents FastAPI Main Application.

Exposes REST and SSE endpoints for the TradingAgents PWA frontend.
"""

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.v1.admin import router as admin_router
from backend.app.api.v1.alerts import router as alerts_router
from backend.app.api.v1.backtest import router as backtest_router
from backend.app.api.v1.market import router as market_router
from backend.app.api.v1.portfolio import router as portfolio_router
from backend.app.api.v1.research import router as research_router
from backend.app.api.v1.trading import router as trading_router
from backend.app.api.v1.watchlist import router as watchlist_router
from backend.app.auth import UserClaims, get_current_user
from backend.app.config import settings

_START_TIME = datetime.now(UTC)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup and shutdown management."""
    # Ensure local data directory exists
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Full-stack AI financial research, backtesting, and paper trading framework.",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(alerts_router)
app.include_router(backtest_router)
app.include_router(market_router)
app.include_router(portfolio_router)
app.include_router(research_router)
app.include_router(trading_router)
app.include_router(watchlist_router)


@app.get("/health", tags=["System"])
@app.get("/api/v1/health", tags=["System"])
async def health_check() -> dict[str, Any]:
    """Service health check, version, and safety boundaries."""
    uptime_seconds = (datetime.now(UTC) - _START_TIME).total_seconds()
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "live_trading_enabled": settings.enable_live_trading,
        "sandbox_mode": settings.broker_sandbox_mode,
        "default_ai_provider": settings.default_ai_provider,
        "uptime_seconds": round(uptime_seconds, 1),
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.get("/api/v1/system/info", tags=["System"])
async def system_info() -> dict[str, Any]:
    """Public system configuration and safe parameter limits."""
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "live_trading_enabled": settings.enable_live_trading,
        "quotas": {
            "daily_research_jobs": settings.user_daily_job_quota,
            "max_job_timeout_seconds": settings.max_job_timeout_seconds,
            "max_order_notional_usd": settings.max_order_notional_usd,
        },
        "default_models": {
            "provider": settings.default_ai_provider,
            "quick": settings.default_quick_model,
            "deep": settings.default_deep_model,
        },
    }


@app.get("/api/v1/user/profile", tags=["User"])
async def get_user_profile(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> dict[str, Any]:
    """Retrieve verified profile of the authenticated user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "daily_job_quota": settings.user_daily_job_quota,
    }



@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Structured JSON error response for unhandled server exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc) if settings.debug else "An unexpected error occurred.",
            "path": request.url.path,
        },
    )
