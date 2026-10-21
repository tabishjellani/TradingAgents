"""Unit tests for Paper Trading Accounting and Backtesting API."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.engine.paper_trading import (
    PaperOrderRequest,
    PaperTradingEngine,
    PortfolioState,
)
from backend.app.main import app

USER_TOKEN = "test-token:usr-quant:quant@example.com:user"


def test_paper_trading_accounting_precision():
    """Verify Decimal arithmetic precision in paper trading execution."""
    portfolio = PortfolioState(
        user_id="usr-test",
        name="Precision Test Portfolio",
        initial_cash=10000.00,
        current_cash=10000.00,
    )

    # 1. Buy 10 units at $100.00 (with 5 bps slippage = $100.05, 0 fees)
    order1 = PaperOrderRequest(
        symbol="NVDA",
        side="buy",
        quantity=10,
        slippage_bps=5,
        fee_bps=0,
    )
    fill1 = PaperTradingEngine.execute_order(portfolio, order1, current_market_price=100.00)
    assert fill1.status == "filled"
    assert fill1.price == 100.05
    assert fill1.total_cost == 1000.50
    assert portfolio.current_cash == 8999.50
    assert portfolio.positions["NVDA"].quantity == 10.0
    assert portfolio.positions["NVDA"].average_entry_price == 100.05

    # 2. Sell 5 units at $120.00 (with 5 bps slippage = $119.94)
    order2 = PaperOrderRequest(
        symbol="NVDA",
        side="sell",
        quantity=5,
        slippage_bps=5,
        fee_bps=0,
    )
    fill2 = PaperTradingEngine.execute_order(portfolio, order2, current_market_price=120.00)
    assert fill2.status == "filled"
    assert fill2.price == 119.94
    assert fill2.total_cost == 599.70
    assert portfolio.current_cash == 8999.50 + 599.70
    assert portfolio.positions["NVDA"].quantity == 5.0
    # Realized PnL: 5 * (119.94 - 100.05) = 99.45
    assert round(portfolio.realized_pnl, 2) == 99.45

    # 3. Excessive sell must be rejected
    order3 = PaperOrderRequest(symbol="NVDA", side="sell", quantity=100)
    fill3 = PaperTradingEngine.execute_order(portfolio, order3, current_market_price=120.00)
    assert fill3.status == "rejected"
    assert "Insufficient units held" in fill3.rejection_reason


@pytest.mark.asyncio
async def test_portfolio_api_endpoints():
    """Verify Portfolio REST endpoints for order execution and ledger history."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get portfolio
        list_res = await client.get(
            "/api/v1/portfolios",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert list_res.status_code == 200
        p_id = list_res.json()[0]["id"]

        # Submit paper buy order
        order_res = await client.post(
            f"/api/v1/portfolios/{p_id}/orders",
            json={"symbol": "AAPL", "side": "buy", "quantity": 5},
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert order_res.status_code == 200
        assert order_res.json()["status"] == "filled"

        # List order ledger
        ledger_res = await client.get(
            f"/api/v1/portfolios/{p_id}/orders",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert ledger_res.status_code == 200
        assert len(ledger_res.json()) >= 1


@pytest.mark.asyncio
async def test_backtest_sweep_endpoint():
    """Verify Backtest sweep execution and parameter validation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/backtest/run",
            json={
                "tickers": ["NVDA", "AAPL"],
                "start_date": "2026-06-01",
                "end_date": "2026-07-01",
                "every_n_days": 7,
            },
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["cells_count"] > 0
        assert data["hit_rate"] > 0
        assert "mean_alpha" in data


@pytest.mark.asyncio
async def test_concurrent_order_execution_balance_safety():
    """Verify concurrent order execution maintains atomic cash balance and position quantity."""
    import asyncio

    user_token = "test-token:usr-concurrent-user:concurrent@example.com:user"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get portfolio
        p_res = await client.get("/api/v1/portfolios", headers={"Authorization": f"Bearer {user_token}"})
        assert p_res.status_code == 200
        portfolio = p_res.json()[0]
        p_id = portfolio["id"]
        initial_cash = portfolio["current_cash"]

        # Concurrently submit 5 separate buy orders
        async def submit_one(idx: int):
            return await client.post(
                f"/api/v1/portfolios/{p_id}/orders",
                json={"symbol": "AAPL", "side": "buy", "quantity": 2, "idempotency_key": f"order-seq-{idx}"},
                headers={"Authorization": f"Bearer {user_token}"},
            )

        responses = await asyncio.gather(*(submit_one(i) for i in range(5)))

        total_spent = 0.0
        for res in responses:
            assert res.status_code == 200
            order_data = res.json()
            assert order_data["status"] == "filled"
            total_spent += order_data["total_cost"]

        # Fetch updated portfolio
        p_updated_res = await client.get("/api/v1/portfolios", headers={"Authorization": f"Bearer {user_token}"})
        assert p_updated_res.status_code == 200
        updated_portfolio = p_updated_res.json()[0]

        # Verify atomic consistency: total quantity is 10, cash matches initial - sum(total_cost)
        assert updated_portfolio["positions"]["AAPL"]["quantity"] == 10.0
        expected_cash = round(initial_cash - total_spent, 2)
        assert round(updated_portfolio["current_cash"], 2) == expected_cash


@pytest.mark.asyncio
async def test_paper_trading_idempotency_duplicate_submission():
    """Verify that duplicate order submission with same idempotency_key returns cached fill without deducting cash twice."""
    user_token = "test-token:usr-idemp-user:idemp@example.com:user"
    idempotency_token = "idemp-client-unique-token-42"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        p_res = await client.get("/api/v1/portfolios", headers={"Authorization": f"Bearer {user_token}"})
        p_id = p_res.json()[0]["id"]
        initial_cash = p_res.json()[0]["current_cash"]

        order_payload = {
            "symbol": "MSFT",
            "side": "buy",
            "quantity": 3,
            "idempotency_key": idempotency_token,
        }

        # 1. First submission
        res1 = await client.post(
            f"/api/v1/portfolios/{p_id}/orders",
            json=order_payload,
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res1.status_code == 200
        order1 = res1.json()
        assert order1["status"] == "filled"
        fill_id = order1["id"]
        total_cost = order1["total_cost"]

        # 2. Duplicate submission with exact same idempotency_key
        res2 = await client.post(
            f"/api/v1/portfolios/{p_id}/orders",
            json=order_payload,
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res2.status_code == 200
        order2 = res2.json()

        # Must return the identical order without re-executing
        assert order2["id"] == fill_id
        assert order2["idempotency_key"] == idempotency_token

        # Check portfolio state: cash deducted only ONCE, quantity is 3 (not 6)
        p_after = await client.get("/api/v1/portfolios", headers={"Authorization": f"Bearer {user_token}"})
        after_data = p_after.json()[0]
        assert after_data["positions"]["MSFT"]["quantity"] == 3.0
        assert round(after_data["current_cash"], 2) == round(initial_cash - total_cost, 2)


@pytest.mark.asyncio
async def test_concurrent_duplicate_idempotency_safety():
    """Verify concurrent duplicate requests with the same idempotency_key execute exactly once."""
    import asyncio

    user_token = "test-token:usr-race-idemp:race@example.com:user"
    shared_key = "idemp-concurrent-race-token-999"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        p_res = await client.get("/api/v1/portfolios", headers={"Authorization": f"Bearer {user_token}"})
        p_id = p_res.json()[0]["id"]
        initial_cash = p_res.json()[0]["current_cash"]

        order_payload = {
            "symbol": "GOOGL",
            "side": "buy",
            "quantity": 4,
            "idempotency_key": shared_key,
        }

        async def send_duplicate():
            return await client.post(
                f"/api/v1/portfolios/{p_id}/orders",
                json=order_payload,
                headers={"Authorization": f"Bearer {user_token}"},
            )

        # Fire 4 identical requests simultaneously
        responses = await asyncio.gather(*(send_duplicate() for _ in range(4)))

        # All 4 requests succeed with 200
        order_ids = set()
        for r in responses:
            assert r.status_code == 200
            order_data = r.json()
            assert order_data["status"] == "filled"
            order_ids.add(order_data["id"])

        # Exactly 1 unique order ID was created
        assert len(order_ids) == 1

        # Check portfolio
        p_after = await client.get("/api/v1/portfolios", headers={"Authorization": f"Bearer {user_token}"})
        after_data = p_after.json()[0]
        assert after_data["positions"]["GOOGL"]["quantity"] == 4.0
        cost = responses[0].json()["total_cost"]
        assert round(after_data["current_cash"], 2) == round(initial_cash - cost, 2)

