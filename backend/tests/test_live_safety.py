"""Unit tests for Live Trading Safety Controls, Pre-Flight Risk Checks, and Kill Switch."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.config import settings
from backend.app.engine.live_safety import safety_manager
from backend.app.main import app

USER_TOKEN = "test-token:usr-trader:trader@example.com:user"


@pytest.fixture(autouse=True)
def reset_safety_state(monkeypatch):
    """Ensure safety state is clean and live mode is disabled for all tests."""
    monkeypatch.setattr(settings, "enable_live_trading", False)
    monkeypatch.setattr(settings, "max_order_notional_usd", 1000.0)
    safety_manager.reset_kill_switch(admin_email="test-suite")


@pytest.mark.asyncio
async def test_live_trading_disabled_by_default():
    """Default environment must refuse any live order with 403 Forbidden."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Pre-flight preview identifies that live trading is disabled
        preview_res = await client.post(
            "/api/v1/trading/orders/preview",
            json={
                "symbol": "AAPL",
                "side": "buy",
                "quantity": 1,
                "idempotency_key": "idemp-001",
                "confirmed": True,
            },
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert preview_res.status_code == 200
        preview = preview_res.json()
        assert preview["passed"] is False
        assert any("disabled" in v.lower() for v in preview["violations"])

        # Submission fails closed with 403
        submit_res = await client.post(
            "/api/v1/trading/orders/submit",
            json={
                "symbol": "AAPL",
                "side": "buy",
                "quantity": 1,
                "idempotency_key": "idemp-002",
                "confirmed": True,
            },
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert submit_res.status_code == 403
        assert "disabled" in submit_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_kill_switch_aborts_all_operations():
    """Emergency kill switch engagement immediately halts order submission."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Trigger kill switch
        ks_res = await client.post(
            "/api/v1/trading/kill-switch",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert ks_res.status_code == 200
        assert ks_res.json()["kill_switch_active"] is True

        # 2. Check safety status shows kill switch engaged
        status_res = await client.get(
            "/api/v1/trading/safety-status",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert status_res.status_code == 200
        assert status_res.json()["kill_switch_active"] is True

        # 3. Order submission is blocked
        submit_res = await client.post(
            "/api/v1/trading/orders/submit",
            json={
                "symbol": "NVDA",
                "side": "buy",
                "quantity": 1,
                "idempotency_key": "idemp-003",
                "confirmed": True,
            },
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert submit_res.status_code == 400
        assert "Kill Switch" in submit_res.json()["detail"]


@pytest.mark.asyncio
async def test_notional_risk_limit_preview():
    """Orders exceeding $1,000 maximum notional must be flagged in preflight."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Quantity 100 of NVDA (~$138/share = $13,800 notional) > $1,000 limit
        preview_res = await client.post(
            "/api/v1/trading/orders/preview",
            json={
                "symbol": "NVDA",
                "side": "buy",
                "quantity": 100,
                "idempotency_key": "idemp-004",
                "confirmed": False,
            },
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert preview_res.status_code == 200
        data = preview_res.json()
        assert data["passed"] is False
        assert any("exceeds maximum risk limit" in v for v in data["violations"])
