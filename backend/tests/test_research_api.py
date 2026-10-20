"""Unit tests for Research Job Lifecycle and API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app

USER_A_TOKEN = "test-token:usr-alpha:alpha@example.com:user"
USER_B_TOKEN = "test-token:usr-beta:beta@example.com:user"


@pytest.mark.asyncio
async def test_submit_and_query_research_job(monkeypatch):
    """Verify research job submission, listing, and state lifecycle."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Submit job
        payload = {
            "symbol": "NVDA",
            "trade_date": "2026-09-01",
            "asset_type": "stock",
            "analysts": ["market", "news"],
        }
        submit_res = await client.post(
            "/api/v1/research/jobs",
            json=payload,
            headers={"Authorization": f"Bearer {USER_A_TOKEN}"},
        )
        assert submit_res.status_code == 202
        job = submit_res.json()
        job_id = job["id"]
        assert job["symbol"] == "NVDA"
        assert job["status"] in ("queued", "running")

        # 2. List jobs
        list_res = await client.get(
            "/api/v1/research/jobs",
            headers={"Authorization": f"Bearer {USER_A_TOKEN}"},
        )
        assert list_res.status_code == 200
        jobs = list_res.json()
        assert any(j["id"] == job_id for j in jobs)

        # 3. Get single job
        get_res = await client.get(
            f"/api/v1/research/jobs/{job_id}",
            headers={"Authorization": f"Bearer {USER_A_TOKEN}"},
        )
        assert get_res.status_code == 200
        assert get_res.json()["id"] == job_id


@pytest.mark.asyncio
async def test_cross_user_job_isolation():
    """Verify User B cannot access or cancel User A's research jobs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User A creates a job
        submit_res = await client.post(
            "/api/v1/research/jobs",
            json={"symbol": "AAPL", "trade_date": "2026-09-01"},
            headers={"Authorization": f"Bearer {USER_A_TOKEN}"},
        )
        job_id = submit_res.json()["id"]

        # User B attempts to view User A's job -> 404
        b_res = await client.get(
            f"/api/v1/research/jobs/{job_id}",
            headers={"Authorization": f"Bearer {USER_B_TOKEN}"},
        )
        assert b_res.status_code == 404

        # User B attempts to cancel User A's job -> 400/404
        cancel_res = await client.post(
            f"/api/v1/research/jobs/{job_id}/cancel",
            headers={"Authorization": f"Bearer {USER_B_TOKEN}"},
        )
        assert cancel_res.status_code == 400


@pytest.mark.asyncio
async def test_cancel_own_job(monkeypatch):
    """Verify user can cancel their own active or queued job."""
    import time

    monkeypatch.setattr(
        "backend.app.engine.job_manager.execute_research_run",
        lambda *args, **kwargs: time.sleep(2),
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        submit_res = await client.post(
            "/api/v1/research/jobs",
            json={"symbol": "MSFT", "trade_date": "2026-09-01"},
            headers={"Authorization": f"Bearer {USER_A_TOKEN}"},
        )
        job_id = submit_res.json()["id"]

        cancel_res = await client.post(
            f"/api/v1/research/jobs/{job_id}/cancel",
            headers={"Authorization": f"Bearer {USER_A_TOKEN}"},
        )
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"
