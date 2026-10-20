"""Alerts & Notifications API router."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.auth import UserClaims, get_current_user
from backend.app.db.repository import db_repo
from backend.app.engine.alert_evaluator import (
    AlertRuleModel,
    NotificationModel,
    alert_evaluator,
)
from tradingagents.dataflows.symbols import safe_ticker_component

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


class CreateAlertRequest(BaseModel):
    symbol: str
    condition: str = Field(pattern="^(above|below|pct_change)$")
    threshold: float
    cooldown_minutes: int = Field(default=60, ge=1)


@router.get("", response_model=list[AlertRuleModel])
async def list_user_alerts(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> list[AlertRuleModel]:
    """List active alert rules for current user."""
    return alert_evaluator.list_rules(current_user.id)


@router.post("", response_model=AlertRuleModel, status_code=status.HTTP_201_CREATED)
async def create_user_alert(
    req: CreateAlertRequest,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> AlertRuleModel:
    """Create a new server-side price alert rule."""
    clean_symbol = safe_ticker_component(req.symbol.strip().upper())
    rule = AlertRuleModel(
        user_id=current_user.id,
        symbol=clean_symbol,
        condition=req.condition,  # type: ignore
        threshold=req.threshold,
        cooldown_minutes=req.cooldown_minutes,
    )
    saved = alert_evaluator.add_rule(rule)
    await db_repo.save_alert_rule(saved.model_dump())
    return saved


@router.delete("/{alert_id}")
async def delete_user_alert(
    alert_id: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> dict[str, str]:
    """Delete an existing alert rule."""
    success = alert_evaluator.remove_rule(alert_id, user_id=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert rule not found.",
        )
    await db_repo.delete_alert_rule(alert_id, current_user.id)
    return {"status": "deleted", "alert_id": alert_id}


@router.get("/notifications", response_model=list[NotificationModel])
async def list_user_notifications(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> list[NotificationModel]:
    """Retrieve in-app notification feed."""
    return alert_evaluator.list_notifications(current_user.id)
