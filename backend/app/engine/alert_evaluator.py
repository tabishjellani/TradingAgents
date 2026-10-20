"""Server-Side Background Alert Evaluator."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field


class AlertRuleModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    symbol: str
    condition: Literal["above", "below", "pct_change"]
    threshold: float
    is_active: bool = True
    cooldown_minutes: int = 60
    last_triggered_at: datetime | None = None


class NotificationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    message: str
    is_read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class AlertEvaluator:
    """Evaluates rules against current market prices and fires notifications."""

    def __init__(self):
        self._rules: dict[str, AlertRuleModel] = {}
        self._notifications: list[NotificationModel] = []

    def add_rule(self, rule: AlertRuleModel) -> AlertRuleModel:
        self._rules[rule.id] = rule
        return rule

    def remove_rule(self, rule_id: str, user_id: str) -> bool:
        rule = self._rules.get(rule_id)
        if rule and rule.user_id == user_id:
            del self._rules[rule_id]
            return True
        return False

    def list_rules(self, user_id: str) -> list[AlertRuleModel]:
        return [r for r in self._rules.values() if r.user_id == user_id]

    def list_notifications(self, user_id: str) -> list[NotificationModel]:
        return [n for n in self._notifications if n.user_id == user_id]

    def evaluate_all(self, market_quotes: dict[str, float]) -> list[NotificationModel]:
        """Check all active rules against latest market quotes."""
        now = datetime.now(UTC)
        new_notifications: list[NotificationModel] = []

        for rule in self._rules.values():
            if not rule.is_active:
                continue

            # Check cooldown
            if rule.last_triggered_at:
                cooldown_delta = timedelta(minutes=rule.cooldown_minutes)
                if now - rule.last_triggered_at < cooldown_delta:
                    continue

            current_price = market_quotes.get(rule.symbol.upper())
            if current_price is None:
                continue

            triggered = False
            msg = ""

            if rule.condition == "above" and current_price >= rule.threshold:
                triggered = True
                msg = f"{rule.symbol} rose above threshold ${rule.threshold:.2f} (Current: ${current_price:.2f})"
            elif rule.condition == "below" and current_price <= rule.threshold:
                triggered = True
                msg = f"{rule.symbol} dropped below threshold ${rule.threshold:.2f} (Current: ${current_price:.2f})"

            if triggered:
                rule.last_triggered_at = now
                notification = NotificationModel(
                    user_id=rule.user_id,
                    title=f"Price Alert: {rule.symbol}",
                    message=msg,
                )
                self._notifications.insert(0, notification)
                new_notifications.append(notification)

        return new_notifications


# Global singleton alert evaluator
alert_evaluator = AlertEvaluator()
