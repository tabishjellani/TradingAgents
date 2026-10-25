"""Automated tests for Admin AI Provider Key Vault & Management endpoints."""

import os

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.config import settings
from backend.app.core.secrets_vault import vault
from backend.app.main import app

ADMIN_TOKEN = "test-token:usr-admin-01:admin@tradingagents.local:admin"
USER_TOKEN = "test-token:usr-regular-01:trader@tradingagents.local:user"


@pytest.fixture(autouse=True)
def clean_vault():
    """Ensure clean vault and environment keys between tests."""
    # Backup original environment
    orig_google = os.environ.get("GOOGLE_API_KEY")
    orig_provider = settings.default_ai_provider
    orig_quick = settings.default_quick_model
    orig_deep = settings.default_deep_model

    yield

    # Restore
    vault.remove_provider_key("google")
    vault.remove_provider_key("openai")
    vault.remove_provider_key("groq")
    vault.remove_provider_key("anthropic")
    if orig_google:
        os.environ["GOOGLE_API_KEY"] = orig_google
    else:
        os.environ.pop("GOOGLE_API_KEY", None)
    settings.default_ai_provider = orig_provider
    settings.default_quick_model = orig_quick
    settings.default_deep_model = orig_deep


@pytest.mark.asyncio
async def test_admin_ai_providers_requires_admin():
    """Unauthenticated or regular user cannot access AI provider admin endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Unauthenticated -> 401
        res = await client.get("/api/v1/admin/ai-providers")
        assert res.status_code == 401

        # Regular user -> 403 Forbidden
        res = await client.get(
            "/api/v1/admin/ai-providers",
            headers={"Authorization": f"Bearer {USER_TOKEN}"},
        )
        assert res.status_code == 403

        # Admin user -> 200 OK
        res = await client.get(
            "/api/v1/admin/ai-providers",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "providers" in data
        assert len(data["providers"]) == 4
        provider_ids = [p["id"] for p in data["providers"]]
        assert "google" in provider_ids
        assert "openai" in provider_ids


@pytest.mark.asyncio
async def test_set_provider_key_encrypted_vault():
    """Admin can store an API key in the encrypted vault; response never leaks the raw key."""
    raw_test_key = "AIzaSyFakeGoogleGeminiTestKey12345678"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/admin/ai-providers/keys",
            json={"provider": "google", "api_key": raw_test_key},
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["provider"] == "google"
        assert raw_test_key not in str(data)  # Plaintext key is NEVER in response
        assert "masked_key" in data
        assert data["masked_key"].startswith("AIza")
        assert data["masked_key"].endswith("5678")
        assert data["source"] == "encrypted_vault"

        # Verify key is available to internal vault
        resolved = vault.get_provider_key("google")
        assert resolved == raw_test_key

        # Verify file is encrypted on disk and does not contain raw key plaintext
        enc_file = settings.data_dir / "secrets.enc"
        assert enc_file.exists()
        raw_disk_bytes = enc_file.read_bytes()
        assert raw_test_key.encode("utf-8") not in raw_disk_bytes


@pytest.mark.asyncio
async def test_delete_provider_key():
    """Admin can remove a provider key from the encrypted vault."""
    vault.set_provider_key("openai", "sk-proj-TestOpenAiKey123456789")
    assert vault.get_provider_key("openai") == "sk-proj-TestOpenAiKey123456789"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.delete(
            "/api/v1/admin/ai-providers/keys/openai",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 200
        assert res.json()["success"] is True
        assert res.json()["removed"] is True

        # Key should now be gone from vault and environment
        assert vault.get_provider_key("openai") is None
        assert os.environ.get("OPENAI_API_KEY") is None


@pytest.mark.asyncio
async def test_update_ai_config_validation():
    """Admin can update active provider and models, with strict catalog validation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Valid update
        res = await client.post(
            "/api/v1/admin/ai-providers/config",
            json={
                "default_ai_provider": "google",
                "default_quick_model": "gemini-3.8-flash",
                "default_deep_model": "gemini-3.8-flash",
            },
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 200
        assert res.json()["default_ai_provider"] == "google"

        # 2. Unsupported provider -> 400
        res = await client.post(
            "/api/v1/admin/ai-providers/config",
            json={
                "default_ai_provider": "unsupported_llm",
                "default_quick_model": "some-model",
                "default_deep_model": "some-model",
            },
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 400

        # 3. Invalid model for valid provider -> 400
        res = await client.post(
            "/api/v1/admin/ai-providers/config",
            json={
                "default_ai_provider": "google",
                "default_quick_model": "gpt-4o-unknown",
                "default_deep_model": "gemini-3.8-flash",
            },
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_test_connection_endpoint_safe_handling():
    """Connection testing handles invalid keys safely without crashing or exposing secrets."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Testing without key when no key is configured -> 400
        res = await client.post(
            "/api/v1/admin/ai-providers/test-connection",
            json={"provider": "groq"},
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 400
        assert "No API key" in res.json()["detail"]

        # Testing with explicitly invalid key -> handles gracefully (returns 200 with success: false)
        res = await client.post(
            "/api/v1/admin/ai-providers/test-connection",
            json={"provider": "google", "api_key": "invalid_test_key_12345"},
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is False
        assert "failed" in data["message"].lower() or "error" in data["message"].lower()
        assert "invalid_test_key_12345" not in data["message"]


@pytest.mark.asyncio
async def test_all_admin_endpoints_reject_regular_user():
    """Verify RBAC defense-in-depth: every admin AI endpoint returns 403 for regular users."""
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {USER_TOKEN}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # GET /ai-providers
        res = await client.get("/api/v1/admin/ai-providers", headers=headers)
        assert res.status_code == 403

        # POST /ai-providers/keys
        res = await client.post(
            "/api/v1/admin/ai-providers/keys",
            json={"provider": "google", "api_key": "some-secret-key-1234"},
            headers=headers,
        )
        assert res.status_code == 403

        # DELETE /ai-providers/keys/google
        res = await client.delete("/api/v1/admin/ai-providers/keys/google", headers=headers)
        assert res.status_code == 403

        # POST /ai-providers/config
        res = await client.post(
            "/api/v1/admin/ai-providers/config",
            json={
                "default_ai_provider": "google",
                "default_quick_model": "gemini-2.0-flash",
                "default_deep_model": "gemini-2.0-flash",
            },
            headers=headers,
        )
        assert res.status_code == 403

        # POST /ai-providers/test-connection
        res = await client.post(
            "/api/v1/admin/ai-providers/test-connection",
            json={"provider": "google", "api_key": "test-key-1234"},
            headers=headers,
        )
        assert res.status_code == 403


def test_vault_persistence_across_restarts(tmp_path):
    """Encrypted vault persists secrets across instance restarts with the same master key."""
    from backend.app.core.secrets_vault import SecretsVault

    vault1 = SecretsVault(data_dir=tmp_path)
    vault1.set_provider_key("google", "test-secret-gemini-key-9999")
    assert vault1.get_provider_key("google") == "test-secret-gemini-key-9999"

    # Simulate process restart by creating a second vault instance pointing to same directory
    vault2 = SecretsVault(data_dir=tmp_path)
    assert vault2.get_provider_key("google") == "test-secret-gemini-key-9999"
    st = vault2.get_provider_status("google")
    assert st["configured"] is True
    assert st["source"] == "encrypted_vault"
    assert "test-secret" not in st["masked_key"]


def test_production_vault_refuses_to_corrupt_existing_secrets_when_key_lost(tmp_path, monkeypatch):
    """In production, vault raises RuntimeError if secrets.enc exists but master key is missing."""
    from backend.app.core.secrets_vault import SecretsVault

    # Create secrets with an initial vault
    vault1 = SecretsVault(data_dir=tmp_path)
    vault1.set_provider_key("openai", "test-secret-openai-key-8888")
    assert (tmp_path / "secrets.enc").exists()

    # Delete master key file to simulate losing the key
    (tmp_path / ".vault_key").unlink()

    # Enable production mode and ensure no env key
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.delenv("VAULT_MASTER_KEY", raising=False)

    vault2 = SecretsVault(data_dir=tmp_path)
    with pytest.raises(RuntimeError, match="Production startup failure.*Refusing to generate a new key"):
        vault2._get_fernet()


def test_production_vault_rejects_malformed_env_key(tmp_path, monkeypatch):
    """In production, vault raises RuntimeError if VAULT_MASTER_KEY is invalid."""
    from backend.app.core.secrets_vault import SecretsVault

    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setenv("VAULT_MASTER_KEY", "invalid-non-fernet-key")

    v = SecretsVault(data_dir=tmp_path)
    with pytest.raises(RuntimeError, match="Production startup failure: VAULT_MASTER_KEY is malformed"):
        v._get_fernet()


@pytest.mark.asyncio
async def test_verified_vs_unverified_model_catalog():
    """Verify that provider listing returns verified official models and unverified catalog models."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/admin/ai-providers",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        )
        assert res.status_code == 200
        data = res.json()
        providers = {p["id"]: p for p in data["providers"]}

        # Google verified models
        assert "gemini-2.0-flash" in providers["google"]["verified_quick_models"]
        assert "gemini-1.5-flash" in providers["google"]["verified_quick_models"]
        assert "gemini-3.8-flash" in providers["google"]["unverified_catalog_models"]

        # OpenAI verified models
        assert "gpt-4o" in providers["openai"]["verified_deep_models"]
        assert "gpt-4o-mini" in providers["openai"]["verified_quick_models"]
        assert "gpt-6-luna" in providers["openai"]["unverified_catalog_models"]

        # Groq verified models
        assert "llama-3.3-70b-versatile" in providers["groq"]["verified_quick_models"]
        assert len(providers["groq"]["unverified_catalog_models"]) == 0

        # Anthropic verified models
        assert "claude-3-5-sonnet-latest" in providers["anthropic"]["verified_deep_models"]
        assert "claude-sonnet-5" in providers["anthropic"]["unverified_catalog_models"]

