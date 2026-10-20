"""Unit tests for Supabase Auth, JWT verification, and Role-Based Access Control."""

import time

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.config import settings
from backend.app.main import app

JWT_SECRET = "test-super-secret-jwt-key-32-chars-long!"


@pytest.fixture(autouse=True)
def setup_jwt_secret(monkeypatch):
    """Ensure consistent JWT secret for tests."""
    monkeypatch.setattr(settings, "supabase_jwt_secret", JWT_SECRET)


def create_token(user_id: str, email: str, role: str = "user", expires_in: int = 3600) -> str:
    """Generate a valid signed Supabase HS256 JWT."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": role},
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected():
    """Unauthenticated requests to protected endpoints must return 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/user/profile")
        assert res.status_code == 401
        assert "Authentication required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_valid_user_token_accepted():
    """Valid standard user token receives 200 and matches own identity."""
    token = create_token("usr-12345", "trader@example.com", role="user")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == "usr-12345"
        assert data["email"] == "trader@example.com"
        assert data["role"] == "user"


@pytest.mark.asyncio
async def test_user_denied_admin_endpoint():
    """Standard user attempting to access admin route must be denied with 403."""
    user_token = create_token("usr-12345", "trader@example.com", role="user")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res.status_code == 403
        assert "Administrative privileges required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_admin_granted_admin_endpoint():
    """Admin user accessing admin route must be granted access with 200."""
    admin_token = create_token("adm-99999", "admin@tradingagents.internal", role="admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) > 0


@pytest.mark.asyncio
async def test_malformed_token_rejected():
    """Malformed or invalid signature tokens must return 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": "Bearer not.a.valid.jwt"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_rejected():
    """Expired tokens must return 401 with explicit expiration message."""
    expired_token = create_token("usr-12345", "trader@example.com", expires_in=-60)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert res.status_code == 401
        assert "expired" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cross_user_isolation():
    """Tenant isolation: Token for User A cannot be claimed as User B."""
    token_user_a = create_token("usr-alpha", "alpha@example.com", role="user")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token_user_a}"},
        )
        assert res.status_code == 200
        assert res.json()["id"] == "usr-alpha"
        assert res.json()["id"] != "usr-beta"
