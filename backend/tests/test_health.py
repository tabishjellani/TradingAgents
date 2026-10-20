"""Test suite for backend health and system info endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_health_check_endpoint():
    """Verify /health returns 200, healthy status, and live trading disabled."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["live_trading_enabled"] is False
        assert "uptime_seconds" in data
        assert "version" in data


@pytest.mark.asyncio
async def test_api_v1_health_endpoint():
    """Verify /api/v1/health is an identical alias to /health."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["live_trading_enabled"] is False


@pytest.mark.asyncio
async def test_system_info_endpoint():
    """Verify system info exposes safe configuration limits without secrets."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/system/info")
        assert response.status_code == 200
        data = response.json()
        assert data["live_trading_enabled"] is False
        assert "quotas" in data
        assert data["quotas"]["daily_research_jobs"] > 0
        assert "default_models" in data
