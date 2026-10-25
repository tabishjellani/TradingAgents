import json

import httpx
import pytest

from backend.app.config import settings
from scripts.bootstrap_admin import (
    find_user_by_email,
    promote_user_to_admin,
    validate_environment,
)


def test_validate_environment_missing_keys(monkeypatch):
    """Fails safely with clear RuntimeError if SUPABASE_URL or SERVICE_KEY is missing."""
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")

    with pytest.raises(RuntimeError, match="SUPABASE_URL is required"):
        validate_environment()

    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY is required"):
        validate_environment()


@pytest.mark.asyncio
async def test_find_user_by_email_not_found():
    """Fails safely when the target user does not exist in auth.users."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"users": [{"id": "u-1", "email": "other@example.com"}]})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(ValueError, match="was not found in auth.users"):
            await find_user_by_email(client, "https://mock.supabase.co", "mock-key", "missing@example.com")


@pytest.mark.asyncio
async def test_promote_user_dry_run(monkeypatch):
    """Dry run prints proposed changes without modifying remote users."""
    monkeypatch.setattr(settings, "supabase_url", "https://mock.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "secret-service-key")

    def handler(request: httpx.Request) -> httpx.Response:
        if "/auth/v1/admin/users" in str(request.url) and request.method == "GET":
            return httpx.Response(200, json={"users": [{"id": "usr-admin-cand", "email": "admin@example.com", "app_metadata": {}}]})
        raise AssertionError(f"Unexpected request during dry run: {request.method} {request.url}")

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        res = await promote_user_to_admin("admin@example.com", dry_run=True, client=client)
        assert res["promoted"] is False
        assert res["dry_run"] is True
        assert res["user_id"] == "usr-admin-cand"


@pytest.mark.asyncio
async def test_promote_user_success(monkeypatch):
    """Successful promotion updates both auth.users app_metadata and public.profiles."""
    monkeypatch.setattr(settings, "supabase_url", "https://mock.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "secret-service-key")

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        calls.append((request.method, url_str))
        if request.method == "GET" and "/auth/v1/admin/users" in url_str:
            return httpx.Response(200, json={"users": [{"id": "usr-admin-target", "email": "admin@example.com", "app_metadata": {"role": "user"}}]})
        if request.method == "PUT" and "/auth/v1/admin/users/usr-admin-target" in url_str:
            body = json.loads(request.read())
            assert body["app_metadata"]["role"] == "admin"
            return httpx.Response(200, json={"id": "usr-admin-target", "app_metadata": {"role": "admin"}})
        if request.method == "PATCH" and "/rest/v1/profiles" in url_str:
            body = json.loads(request.read())
            assert body["role"] == "admin"
            assert body["daily_job_quota"] == 1000
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        res = await promote_user_to_admin("admin@example.com", dry_run=False, client=client)
        assert res["promoted"] is True
        assert res["user_id"] == "usr-admin-target"
        assert len(calls) == 3
