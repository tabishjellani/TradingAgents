"""Live Trading Safety and Order Execution Guarded Endpoints."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.auth import UserClaims, get_current_user, require_admin
from backend.app.config import settings
from backend.app.engine.live_safety import (
    KillSwitchActiveError,
    LiveOrderRequest,
    LiveTradingDisabledError,
    RiskCheckResult,
    RiskLimitExceededError,
    safety_manager,
)
from tradingagents.dataflows.symbols import normalize_symbol, safe_ticker_component

router = APIRouter(prefix="/api/v1/trading", tags=["Trading Safety"])


@router.get("/safety-status")
async def get_safety_status(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> dict[str, Any]:
    """Retrieve current 4-tier trading mode and emergency kill switch status."""
    return {
        "modes": {
            "tier_1_research_only": True,
            "tier_2_paper_trading": True,
            "tier_3_broker_sandbox": settings.broker_sandbox_mode,
            "tier_4_live_trading": settings.enable_live_trading,
        },
        "active_mode": (
            "live_trading"
            if settings.enable_live_trading
            else "broker_sandbox"
            if settings.broker_sandbox_mode
            else "paper_trading"
        ),
        "kill_switch_active": safety_manager.is_kill_switch_active,
        "risk_limits": {
            "max_order_notional_usd": settings.max_order_notional_usd,
            "daily_loss_limit_pct": settings.daily_loss_limit_pct,
            "max_open_positions": 5,
        },
    }


@router.post("/kill-switch")
async def trigger_emergency_kill_switch(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> dict[str, Any]:
    """Emergency Kill Switch: immediately halts all order processing and blocks live orders."""
    return safety_manager.trigger_kill_switch(
        actor=current_user.email,
        reason="Manual user/operator emergency trigger",
    )


@router.post("/orders/preview", response_model=RiskCheckResult)
async def preview_order_risk(
    order: LiveOrderRequest,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> RiskCheckResult:
    """Pre-flight risk check preview for live or sandbox orders before submission."""
    clean_symbol = safe_ticker_component(order.symbol.strip().upper())
    canonical = normalize_symbol(clean_symbol)

    # Fetch live price for notional validation
    price = 100.0
    try:
        import yfinance as yf
        ticker = yf.Ticker(canonical)
        last_price = getattr(ticker.fast_info, "last_price", 0.0)
        if last_price and last_price > 0:
            price = float(last_price)
    except Exception:
        pass

    return safety_manager.validate_preflight_risk(order, current_price=price)


@router.post("/orders/submit")
async def submit_guarded_order(
    order: LiveOrderRequest,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> dict[str, Any]:
    """Guarded order execution endpoint. Rejects real capital orders in default environment."""
    clean_symbol = safe_ticker_component(order.symbol.strip().upper())
    canonical = normalize_symbol(clean_symbol)

    price = 100.0
    try:
        import yfinance as yf
        ticker = yf.Ticker(canonical)
        last_price = getattr(ticker.fast_info, "last_price", 0.0)
        if last_price and last_price > 0:
            price = float(last_price)
    except Exception:
        pass

    try:
        return safety_manager.execute_live_order(
            order=order,
            current_price=price,
            actor_email=current_user.email,
        )
    except LiveTradingDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except (RiskLimitExceededError, KillSwitchActiveError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
