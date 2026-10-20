"""Unit tests for Alerts, Administration, and CSV Formula Injection Sanitization."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.engine.alert_evaluator import (
    AlertEvaluator,
    AlertRuleModel,
)
from backend.app.main import app
from backend.app.services.exporter import export_tabular_to_csv, sanitize_csv_cell

USER_TOKEN = "test-token:usr-alerts:alerts@example.com:user"
ADMIN_TOKEN = "test-token:usr-admin:admin@example.com:admin"


def test_csv_formula_injection_sanitization():
    """Verify CWE-1236 CSV injection payloads are neutralized by prefixing single quote."""
    # Dangerous formula prefixes
    assert sanitize_csv_cell("=1+1") == "'=1+1"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-5+2") == "'-5+2"
    assert sanitize_csv_cell("@SUM(1,2)") == "'@SUM(1,2)"
    assert sanitize_csv_cell("\tTab") == "'\tTab"

    # Safe cells remain unaffected
    assert sanitize_csv_cell("AAPL") == "AAPL"
    assert sanitize_csv_cell("150.25") == "150.25"
    assert sanitize_csv_cell("Apple Inc.") == "Apple Inc."

    # Full tabular export test
    headers = ["Ticker", "FormulaAttack", "Price"]
    rows = [["NVDA", "=cmd|' /C calc'!A0", 138.25]]
    csv_text = export_tabular_to_csv(headers, rows)
    assert "'=cmd|" in csv_text


def test_alert_evaluator_triggers_and_cooldown():
    """Verify alert engine fires when threshold met and respects cooldown."""
    evaluator = AlertEvaluator()

    # Rule: Trigger if NVDA > $140
    rule = AlertRuleModel(
        user_id="usr-test",
        symbol="NVDA",
        condition="above",
        threshold=140.0,
        cooldown_minutes=60,
    )
    evaluator.add_rule(rule)

    # 1. Price below threshold -> 0 notifications
    notifs1 = evaluator.evaluate_all({"NVDA": 135.0})
    assert len(notifs1) == 0

    # 2. Price meets threshold ($145) -> 1 notification
    notifs2 = evaluator.evaluate_all({"NVDA": 145.0})
    assert len(notifs2) == 1
    assert "rose above threshold" in notifs2[0].message

    # 3. Repeated evaluation during cooldown window -> 0 duplicate notifications
    notifs3 = evaluator.evaluate_all({"NVDA": 146.0})
    assert len(notifs3) == 0


@pytest.mark.asyncio
async def test_alert_api_lifecycle():
    """Verify alert creation, listing, and deletion REST endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create alert rule
        create_res = await client.post(
            "/api/v1/alerts",
            json={"symbol": "NVDA", "condition": "above", "threshold": 150.0},
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert create_res.status_code == 201
        alert_id = create_res.json()["id"]

        # List alerts
        list_res = await client.get(
            "/api/v1/alerts",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert list_res.status_code == 200
        assert any(a["id"] == alert_id for a in list_res.json())

        # Delete alert
        del_res = await client.delete(
            f"/api/v1/alerts/{alert_id}",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_admin_api_telemetry_and_quotas():
    """Verify admin endpoint security and quota updating."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User receives 403 Forbidden
        user_res = await client.get(
            "/api/v1/admin/telemetry",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert user_res.status_code == 403

        # Admin receives 200 OK
        admin_res = await client.get(
            "/api/v1/admin/telemetry",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert admin_res.status_code == 200
        data = admin_res.json()
        assert "quotas" in data

        # Admin updates quota
        quota_res = await client.post(
            "/api/v1/admin/quotas",
            json={"daily_job_quota": 50},
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert quota_res.status_code == 200
        assert quota_res.json()["new_daily_job_quota"] == 50
