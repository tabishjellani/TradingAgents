"""Unit tests for Market Data and Watchlist API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app

USER_TOKEN = "test-token:usr-tester:tester@example.com:user"


@pytest.mark.asyncio
async def test_get_stock_quote():
    """Verify stock quote retrieval and delayed feed indicator."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/market/quote/NVDA")
        assert res.status_code == 200
        data = res.json()
        assert data["symbol"] == "NVDA"
        assert data["asset_type"] == "stock"
        assert data["price"] > 0
        assert data["is_delayed"] is True


@pytest.mark.asyncio
async def test_crypto_quote_normalization():
    """Verify crypto symbol normalization (BTCUSD -> BTC-USD) and crypto asset type."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/market/quote/BTCUSD")
        assert res.status_code == 200
        data = res.json()
        assert data["symbol"] == "BTCUSD"
        assert data["canonical_symbol"] == "BTC-USD"
        assert data["asset_type"] == "crypto"
        assert data["price"] > 0


@pytest.mark.asyncio
async def test_path_traversal_rejection():
    """Unsafe symbol characters must be blocked with 400 Bad Request."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Dots-only payload or invalid characters
        res = await client.get("/api/v1/market/quote/...")
        assert res.status_code == 400
        assert "ticker" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_watchlist_lifecycle():
    """Verify creating a watchlist, adding symbols, and removing symbols."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create custom watchlist
        create_res = await client.post(
            "/api/v1/watchlists?name=Tech%20Titans",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert create_res.status_code == 201
        wl = create_res.json()
        wl_id = wl["id"]
        assert wl["name"] == "Tech Titans"

        # 2. Add symbol to watchlist
        add_res = await client.post(
            f"/api/v1/watchlists/{wl_id}/items?symbol=MSFT",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert add_res.status_code == 200
        items = add_res.json()["items"]
        assert any(i["symbol"] == "MSFT" for i in items)

        # 3. Remove symbol from watchlist
        del_res = await client.delete(
            f"/api/v1/watchlists/{wl_id}/items/MSFT",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert del_res.status_code == 200
        updated_items = del_res.json()["items"]
        assert not any(i["symbol"] == "MSFT" for i in updated_items)
