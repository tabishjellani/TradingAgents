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
    if settings.supabase_url:
        payload["iss"] = f"{settings.supabase_url.rstrip('/')}/auth/v1"
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


@pytest.mark.asyncio
async def test_forged_role_in_user_metadata_rejected():
    """A user attempting to elevate privilege by inserting 'role: admin' into user_metadata is denied."""
    now = int(time.time())
    forged_payload = {
        "sub": "attacker-user",
        "email": "attacker@example.com",
        "aud": "authenticated",
        "user_metadata": {"role": "admin"},  # Client-writable metadata
        "app_metadata": {"role": "user"},     # Trusted server metadata
        "iat": now,
        "exp": now + 3600,
    }
    forged_token = jwt.encode(forged_payload, JWT_SECRET, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User profile should report role as user, not admin
        res_profile = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert res_profile.status_code == 200
        assert res_profile.json()["role"] == "user"

        # Admin route must be strictly forbidden
        res_admin = await client.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert res_admin.status_code == 403
        assert "Administrative privileges required" in res_admin.json()["detail"]


@pytest.mark.asyncio
async def test_synthetic_token_rejected_in_production_mode(monkeypatch):
    """Synthetic test-token prefixes are rejected with 401 when environment is production."""
    monkeypatch.setattr(settings, "environment", "production")
    test_token = "test-token:dev-user-01:dev@tradingagents.local:admin"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {test_token}"},
        )
        assert res.status_code == 401
        assert "Synthetic test tokens are strictly prohibited in production" in res.json()["detail"]


@pytest.mark.asyncio
async def test_production_requires_jwt_secret(monkeypatch):
    """In production mode, missing JWT secret raises 500 error preventing unverified fallback."""
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": "Bearer some.arbitrary.token"},
        )
        assert res.status_code == 500
        assert "SUPABASE_JWT_SECRET is required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_service_role_key_never_default_for_user_crud(monkeypatch):
    """DatabaseRepository headers must never default to service-role key for user CRUD."""
    from backend.app.db.repository import db_repo

    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-public-key")
    monkeypatch.setattr(settings, "supabase_service_role_key", "secret-service-key")
    monkeypatch.setattr(settings, "environment", "development")

    # 1. User request with real user token uses user token Bearer
    user_headers = db_repo._get_supabase_headers(user_token="user.jwt.token", is_service_role=False)
    assert user_headers["Authorization"] == "Bearer user.jwt.token"

    # 2. User request without token in development uses anon key, never service-role
    anon_headers = db_repo._get_supabase_headers(user_token=None, is_service_role=False)
    assert anon_headers["Authorization"] == "Bearer anon-public-key"
    assert anon_headers["Authorization"] != "Bearer secret-service-key"

    # 3. Explicit service-role call attaches service role key
    svc_headers = db_repo._get_supabase_headers(user_token=None, is_service_role=True)
    assert svc_headers["Authorization"] == "Bearer secret-service-key"


@pytest.mark.asyncio
async def test_origin_protection_gateway_secret(monkeypatch):
    """In production with gateway_shared_secret configured, requests bypassing gateway receive 403."""
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "gateway_shared_secret", "cf-worker-super-secret-gateway-token")
    token = create_token("usr-12345", "trader@example.com", role="user")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Direct origin request without gateway secret is rejected
        res_direct = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_direct.status_code == 403
        assert "Direct origin access forbidden" in res_direct.json()["detail"]

        # Request with correct gateway secret passes through
        res_gateway = await client.get(
            "/api/v1/user/profile",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Gateway-Secret": "cf-worker-super-secret-gateway-token",
            },
        )
        assert res_gateway.status_code == 200
        assert res_gateway.json()["id"] == "usr-12345"

        # Request with incorrect gateway secret must be rejected with 403
        res_tampered_secret = await client.get(
            "/api/v1/user/profile",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Gateway-Secret": "malicious-attacker-forged-secret",
            },
        )
        assert res_tampered_secret.status_code == 403
        assert "Direct origin access forbidden" in res_tampered_secret.json()["detail"]


@pytest.mark.asyncio
async def test_wrong_secret_signature_rejected():
    """Tokens signed with a different key than SUPABASE_JWT_SECRET are strictly rejected."""
    wrong_key = "wrong-secret-key-that-does-not-match!"
    now = int(time.time())
    payload = {
        "sub": "usr-attacker",
        "email": "attacker@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": "user"},
        "iat": now,
        "exp": now + 3600,
    }
    forged_token = jwt.encode(payload, wrong_key, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        assert res.status_code == 401
        assert "Invalid authentication token" in res.json()["detail"]


@pytest.mark.asyncio
async def test_alg_none_token_rejected():
    """Unsigned tokens using algorithm 'none' are rejected."""
    now = int(time.time())
    payload = {
        "sub": "usr-attacker",
        "email": "attacker@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": "admin"},
        "iat": now,
        "exp": now + 3600,
    }
    none_token = jwt.encode(payload, "", algorithm="none")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {none_token}"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_wrong_audience_rejected():
    """Tokens with an audience other than 'authenticated' are rejected."""
    now = int(time.time())
    payload = {
        "sub": "usr-12345",
        "email": "trader@example.com",
        "aud": "anon",  # Wrong audience for authenticated routes
        "role": "anon",
        "app_metadata": {"role": "user"},
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_invalid_issuer_rejected(monkeypatch):
    """Tokens with an issuer not matching configured Supabase auth URL are rejected."""
    monkeypatch.setattr(settings, "supabase_url", "https://valid-project.supabase.co")
    now = int(time.time())
    payload = {
        "sub": "usr-12345",
        "email": "trader@example.com",
        "iss": "https://malicious-fake-supabase.attacker.com/auth/v1",
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": "user"},
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401
        assert "Invalid authentication token issuer" in res.json()["detail"]


@pytest.mark.asyncio
async def test_missing_issuer_claim_rejected(monkeypatch):
    """When supabase_url is configured, tokens omitting the 'iss' claim must be rejected."""
    monkeypatch.setattr(settings, "supabase_url", "https://valid-project.supabase.co")
    now = int(time.time())
    payload = {
        "sub": "usr-12345",
        "email": "trader@example.com",
        # 'iss' claim intentionally omitted
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": "user"},
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401
        assert "missing required 'iss'" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_valid_issuer_claim_accepted(monkeypatch):
    """Tokens with the exact expected issuer claim are accepted."""
    monkeypatch.setattr(settings, "supabase_url", "https://valid-project.supabase.co")
    now = int(time.time())
    payload = {
        "sub": "usr-12345",
        "email": "trader@example.com",
        "iss": "https://valid-project.supabase.co/auth/v1",
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": "user"},
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert res.json()["id"] == "usr-12345"


@pytest.mark.asyncio
async def test_production_requires_supabase_url_for_issuer(monkeypatch):
    """In production mode, missing SUPABASE_URL raises HTTP 500 configuration error."""
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "some-valid-secret-key-32-chars-long")
    monkeypatch.setattr(settings, "supabase_url", "")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": "Bearer some.jwt.token"},
        )
        assert res.status_code == 500
        assert "SUPABASE_URL is required to verify authentication token issuer" in res.json()["detail"]


@pytest.mark.asyncio
async def test_unsupported_algorithm_rejected():
    """Unsupported algorithm tokens (e.g. HS512) are rejected with 401."""
    now = int(time.time())
    payload = {
        "sub": "usr-12345",
        "email": "trader@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"role": "user"},
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS512")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401
        assert "Unsupported or invalid authentication token algorithm" in res.json()["detail"]


@pytest.mark.asyncio
async def test_audit_event_server_side_recording_and_admin_actions():
    """Admin operations persist audit log events with verified server-side actor ID."""
    admin_token = create_token("adm-audit-tester", "auditor@tradingagents.internal", role="admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Update quota -> triggers audit log
        res_q = await client.post(
            "/api/v1/admin/quotas",
            json={"daily_job_quota": 50},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res_q.status_code == 200

        # 2. Check audit logs endpoint returns the recorded event with verified actor_id
        res_trail = await client.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res_trail.status_code == 200
        logs = res_trail.json()
        assert len(logs) > 0
        quota_event = next((item for item in logs if item.get("action") == "global_quota_updated"), None)
        assert quota_event is not None
        assert quota_event["actor"] == "adm-audit-tester"
        assert quota_event["details"]["new_daily_job_quota"] == 50


@pytest.mark.asyncio
async def test_profile_privilege_isolation_and_signup_defaults():
    """Verify profiles default to role: user and cannot be escalated without admin claims."""
    from backend.app.db.repository import db_repo

    # Simulate signup profile creation
    profile = await db_repo.create_profile(
        user_id="usr-fresh-signup",
        email="fresh@example.com",
        role="user",
        daily_job_quota=20,
    )
    assert profile["role"] == "user"
    assert profile["daily_job_quota"] == 20

    # User profile route returns the claims from the verified JWT
    user_token = create_token("usr-fresh-signup", "fresh@example.com", role="user")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/user/profile",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["role"] == "user"
        assert data["id"] == "usr-fresh-signup"


@pytest.mark.asyncio
async def test_job_manager_restart_recovery():
    """Interrupted queued or running jobs are transitioned to failed on process restart."""
    from backend.app.db.repository import db_repo
    from backend.app.engine.job_manager import job_manager

    # Inject simulated running job into store
    data = db_repo._read_local_store()
    data["research_jobs"]["test-interrupted-job"] = {
        "id": "test-interrupted-job",
        "user_id": "usr-recovery-test",
        "symbol": "AAPL",
        "asset_type": "stock",
        "trade_date": "2026-10-01",
        "status": "running",
        "progress_percent": 50,
        "current_step": "In flight before crash",
    }
    db_repo._write_local_store(data)

    # Trigger restart recovery
    await job_manager.recover_active_jobs()

    # Verify job status was marked failed with clear explanation
    recovered = db_repo._read_local_store()["research_jobs"]["test-interrupted-job"]
    assert recovered["status"] == "failed"
    assert "Process restarted" in recovered["error_message"]


@pytest.mark.asyncio
async def test_super_admin_role_enforcement():
    """Verify tiered RBAC: admin can view users, only super_admin can modify roles and bans."""
    user_token = create_token("usr-reg", "user@example.com", role="user")
    admin_token = create_token("adm-staff", "staff@example.com", role="admin")
    super_admin_token = create_token("sa-owner", "owner@example.com", role="super_admin")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. User listing: user denied (403), admin allowed (200), super_admin allowed (200)
        res_u = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {user_token}"})
        assert res_u.status_code == 403

        res_a = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert res_a.status_code == 200
        assert "users" in res_a.json()

        res_sa = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {super_admin_token}"})
        assert res_sa.status_code == 200

        # 2. Role promotion: admin denied (403), super_admin allowed (200)
        res_promo_admin = await client.post(
            "/api/v1/admin/users/usr-target/role",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "admin"},
        )
        assert res_promo_admin.status_code == 403
        assert "Super Administrator" in res_promo_admin.json()["detail"]

        res_promo_sa = await client.post(
            "/api/v1/admin/users/usr-target/role",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"role": "admin"},
        )
        assert res_promo_sa.status_code == 200
        assert res_promo_sa.json()["new_role"] == "admin"

        # 3. Super admin self-demotion is rejected to prevent lockout
        res_self_demote = await client.post(
            "/api/v1/admin/users/sa-owner/role",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"role": "user"},
        )
        assert res_self_demote.status_code == 400
        assert "cannot demote their own account" in res_self_demote.json()["detail"]

        # 4. Super admin self-ban is rejected
        res_self_ban = await client.post(
            "/api/v1/admin/users/sa-owner/status",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"is_banned": True},
        )
        assert res_self_ban.status_code == 400
        assert "cannot suspend their own account" in res_self_ban.json()["detail"]

        # 5. Market status diagnostic endpoint accessible to admin
        res_diag = await client.get("/api/v1/admin/market-status", headers={"Authorization": f"Bearer {admin_token}"})
        assert res_diag.status_code == 200
        assert res_diag.json()["provider"]

