"""Server-Side Authenticated Encrypted Secrets Vault for AI Provider Keys.

Uses Fernet (symmetric authenticated cryptography: AES-128-CBC + HMAC-SHA256)
to store API keys securely on disk at `data/secrets.enc` without storing plaintext keys
in database fields or committing them to version control.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet

from backend.app.config import settings

logger = logging.getLogger(__name__)

# Providers genuinely supported by the TradingAgents engine
SUPPORTED_PROVIDERS = ("google", "openai", "groq", "anthropic")

PROVIDER_ENV_VARS: dict[str, list[str]] = {
    "google": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    "openai": ["OPENAI_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "anthropic": ["ANTHROPIC_API_KEY"],
}


class SecretsVault:
    """Manages encrypted storage and retrieval of provider secrets."""

    def __init__(self, data_dir: Path | None = None):
        self._data_dir = data_dir or settings.data_dir
        self._key_file = self._data_dir / ".vault_key"
        self._enc_file = self._data_dir / "secrets.enc"
        self._fernet: Fernet | None = None

    def _ensure_dirs(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)

    def _get_fernet(self) -> Fernet:
        if self._fernet is not None:
            return self._fernet

        self._ensure_dirs()

        # Check environment override first (e.g. for cloud deployments / CI / platform secrets)
        env_key = os.environ.get("VAULT_MASTER_KEY")
        if env_key:
            try:
                self._fernet = Fernet(env_key.strip().encode("utf-8"))
                return self._fernet
            except Exception as exc:
                logger.error("Invalid VAULT_MASTER_KEY in environment: %s", exc)
                if settings.environment == "production":
                    raise RuntimeError(
                        "Production startup failure: VAULT_MASTER_KEY is malformed or invalid. "
                        "Refusing to fall back to an ephemeral key."
                    ) from exc

        # If running in production mode, enforce that ephemeral keys are NOT silently generated
        # if encrypted secrets already exist without a master key
        if (
            self._enc_file.exists()
            and not self._key_file.exists()
            and settings.environment == "production"
        ):
            raise RuntimeError(
                "Production startup failure: Encrypted vault (secrets.enc) exists but neither "
                "VAULT_MASTER_KEY environment variable nor .vault_key file was found. "
                "Refusing to generate a new key that would permanently corrupt or lock existing secrets. "
                "Please provide the original VAULT_MASTER_KEY via platform secret management."
            )

        # File-based master key (development / single-node persistent storage)
        if self._key_file.exists():
            key = self._key_file.read_bytes().strip()
            self._fernet = Fernet(key)
        else:
            if settings.environment == "production":
                logger.warning(
                    "VAULT_MASTER_KEY is not set in production. Generating a new master key file at %s. "
                    "Ensure this file is backed up or set VAULT_MASTER_KEY in your hosting platform secrets.",
                    self._key_file,
                )
            key = Fernet.generate_key()
            self._key_file.write_bytes(key)
            with contextlib.suppress(Exception):
                os.chmod(self._key_file, 0o600)
            self._fernet = Fernet(key)

        return self._fernet

    def _read_encrypted_store(self) -> dict[str, str]:
        if not self._enc_file.exists():
            return {}
        try:
            fernet = self._get_fernet()
            ciphertext = self._enc_file.read_bytes()
            if not ciphertext:
                return {}
            plaintext = fernet.decrypt(ciphertext)
            return json.loads(plaintext.decode("utf-8"))
        except Exception as exc:
            logger.error("Failed to decrypt secrets store: %s", exc)
            return {}

    def _write_encrypted_store(self, data: dict[str, str]) -> None:
        self._ensure_dirs()
        fernet = self._get_fernet()
        payload = json.dumps(data).encode("utf-8")
        ciphertext = fernet.encrypt(payload)
        self._enc_file.write_bytes(ciphertext)
        with contextlib.suppress(Exception):
            os.chmod(self._enc_file, 0o600)

    def get_provider_key(self, provider: str) -> str | None:
        """Retrieve key from environment first, then from encrypted vault."""
        p_lower = provider.lower()
        if p_lower not in SUPPORTED_PROVIDERS:
            return None

        # 1. Check environment variables
        env_vars = PROVIDER_ENV_VARS.get(p_lower, [])
        for var_name in env_vars:
            val = os.environ.get(var_name)
            if val and val.strip():
                return val.strip()

        # 2. Check encrypted vault
        store = self._read_encrypted_store()
        key = store.get(p_lower)
        if key and key.strip():
            # Sync to process environment so engine modules see it
            primary_var = env_vars[0] if env_vars else None
            if primary_var and not os.environ.get(primary_var):
                os.environ[primary_var] = key.strip()
            return key.strip()

        return None

    def set_provider_key(self, provider: str, api_key: str) -> None:
        """Encrypt and persist key in the vault and set process environment."""
        p_lower = provider.lower()
        if p_lower not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Provider '{provider}' is not supported. Supported: {SUPPORTED_PROVIDERS}")

        clean_key = api_key.strip()
        if len(clean_key) < 8:
            raise ValueError("API key must be at least 8 characters.")

        store = self._read_encrypted_store()
        store[p_lower] = clean_key
        self._write_encrypted_store(store)

        # Set process environment for immediate use
        env_vars = PROVIDER_ENV_VARS.get(p_lower, [])
        for var_name in env_vars:
            os.environ[var_name] = clean_key

        logger.info("Encrypted API key saved for provider '%s'.", p_lower)

    def remove_provider_key(self, provider: str) -> bool:
        """Remove key from encrypted vault and unset from process environment."""
        p_lower = provider.lower()
        store = self._read_encrypted_store()
        removed = False
        if p_lower in store:
            del store[p_lower]
            self._write_encrypted_store(store)
            removed = True

        # Unset from process environment
        env_vars = PROVIDER_ENV_VARS.get(p_lower, [])
        for var_name in env_vars:
            os.environ.pop(var_name, None)

        logger.info("API key removed for provider '%s'.", p_lower)
        return removed

    @staticmethod
    def mask_key(key: str | None) -> str:
        """Safely mask key for display without leaking characters."""
        if not key:
            return ""
        k = key.strip()
        if len(k) <= 8:
            return "••••••••"
        return f"{k[:4]}••••••••{k[-4:]}"

    def get_provider_status(self, provider: str) -> dict[str, Any]:
        """Inspect provider configuration source without exposing raw secret."""
        p_lower = provider.lower()
        env_vars = PROVIDER_ENV_VARS.get(p_lower, [])

        # 1. Check encrypted store first to identify vault-managed keys
        store = self._read_encrypted_store()
        vault_val = store.get(p_lower)
        if vault_val and vault_val.strip():
            return {
                "configured": True,
                "masked_key": self.mask_key(vault_val),
                "source": "encrypted_vault",
            }

        # 2. Check environment if not managed in vault
        for var_name in env_vars:
            val = os.environ.get(var_name)
            if val and val.strip():
                return {
                    "configured": True,
                    "masked_key": self.mask_key(val),
                    "source": "environment",
                }

        return {
            "configured": False,
            "masked_key": "",
            "source": "none",
        }


vault = SecretsVault()
