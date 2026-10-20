"""Database Repository Layer.

Provides unified persistence for watchlists, portfolios, orders, research jobs,
reports, and alert rules.
When Supabase is configured (SUPABASE_URL and SUPABASE_ANON_KEY/SERVICE_ROLE_KEY),
it syncs via Supabase PostgREST REST API enforcing database Row Level Security.
When offline, it transparently persists to a local file store partitioned by user_id.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx

from backend.app.config import settings

logger = logging.getLogger(__name__)

LOCAL_STORE_PATH = Path("./data/local_store.json")


class DatabaseRepository:
    """Multi-tenant persistence repository with Supabase and offline fallback."""

    def __init__(self):
        self._ensure_local_store()

    def _ensure_local_store(self):
        LOCAL_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not LOCAL_STORE_PATH.exists():
            initial_data = {
                "watchlists": {},
                "portfolios": {},
                "orders": {},
                "research_jobs": {},
                "research_reports": {},
                "alert_rules": {},
                "backtest_runs": {},
            }
            LOCAL_STORE_PATH.write_text(json.dumps(initial_data, indent=2), encoding="utf-8")

    def _read_local_store(self) -> dict[str, Any]:
        try:
            return json.loads(LOCAL_STORE_PATH.read_text(encoding="utf-8"))
        except Exception:
            self._ensure_local_store()
            return json.loads(LOCAL_STORE_PATH.read_text(encoding="utf-8"))

    def _write_local_store(self, data: dict[str, Any]):
        LOCAL_STORE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    @property
    def is_supabase_enabled(self) -> bool:
        return bool(settings.supabase_url and (settings.supabase_anon_key or settings.supabase_service_role_key))

    def _get_supabase_headers(self, user_token: str | None = None) -> dict[str, str]:
        key = settings.supabase_service_role_key or settings.supabase_anon_key
        headers = {
            "apikey": key,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        if user_token and not user_token.startswith("test-token:"):
            headers["Authorization"] = f"Bearer {user_token}"
        elif settings.supabase_service_role_key:
            headers["Authorization"] = f"Bearer {settings.supabase_service_role_key}"
        return headers

    # -------------------------------------------------------------------------
    # Watchlists
    # -------------------------------------------------------------------------
    async def get_watchlists(self, user_id: str, token: str | None = None) -> list[dict[str, Any]]:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/watchlists?user_id=eq.{user_id}&select=*,watchlist_items(*)",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code == 200:
                        return res.json()
            except Exception as exc:
                logger.warning("Supabase get_watchlists fallback to local store: %s", exc)

        data = self._read_local_store()
        return [w for w in data.get("watchlists", {}).values() if w.get("user_id") == user_id]

    async def save_watchlist(self, watchlist: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"{settings.supabase_url}/rest/v1/watchlists",
                        json=watchlist,
                        headers=self._get_supabase_headers(token),
                    )
            except Exception as exc:
                logger.warning("Supabase save_watchlist fallback to local store: %s", exc)

        data = self._read_local_store()
        data["watchlists"][watchlist["id"]] = watchlist
        self._write_local_store(data)

    # -------------------------------------------------------------------------
    # Portfolios & Orders
    # -------------------------------------------------------------------------
    async def get_portfolio(self, user_id: str, token: str | None = None) -> dict[str, Any] | None:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/portfolios?user_id=eq.{user_id}&select=*,positions(*)",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code == 200 and res.json():
                        return res.json()[0]
            except Exception as exc:
                logger.warning("Supabase get_portfolio fallback to local store: %s", exc)

        data = self._read_local_store()
        for p in data.get("portfolios", {}).values():
            if p.get("user_id") == user_id:
                return p
        return None

    async def save_portfolio(self, portfolio: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"{settings.supabase_url}/rest/v1/portfolios",
                        json=portfolio,
                        headers=self._get_supabase_headers(token),
                    )
            except Exception as exc:
                logger.warning("Supabase save_portfolio fallback to local store: %s", exc)

        data = self._read_local_store()
        data["portfolios"][portfolio["id"]] = portfolio
        self._write_local_store(data)

    async def save_order(self, order: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"{settings.supabase_url}/rest/v1/orders",
                        json=order,
                        headers=self._get_supabase_headers(token),
                    )
            except Exception as exc:
                logger.warning("Supabase save_order fallback to local store: %s", exc)

        data = self._read_local_store()
        data["orders"][order["id"]] = order
        self._write_local_store(data)

    async def get_orders(self, portfolio_id: str, token: str | None = None) -> list[dict[str, Any]]:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/orders?portfolio_id=eq.{portfolio_id}&order=created_at.desc",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code == 200:
                        return res.json()
            except Exception as exc:
                logger.warning("Supabase get_orders fallback to local store: %s", exc)

        data = self._read_local_store()
        return [o for o in data.get("orders", {}).values() if o.get("portfolio_id") == portfolio_id]

    # -------------------------------------------------------------------------
    # Research Jobs & Reports
    # -------------------------------------------------------------------------
    async def save_research_job(self, job: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"{settings.supabase_url}/rest/v1/research_jobs",
                        json={
                            "id": job["id"],
                            "user_id": job["user_id"],
                            "symbol": job["symbol"],
                            "asset_type": job["asset_type"],
                            "trade_date": job["trade_date"],
                            "status": job["status"],
                            "error_message": job.get("error_message"),
                            "created_at": job.get("created_at"),
                            "completed_at": job.get("completed_at"),
                        },
                        headers=self._get_supabase_headers(token),
                    )
            except Exception as exc:
                logger.warning("Supabase save_research_job fallback to local store: %s", exc)

        data = self._read_local_store()
        data["research_jobs"][job["id"]] = job
        self._write_local_store(data)

    async def get_research_job(self, job_id: str, user_id: str) -> dict[str, Any] | None:
        data = self._read_local_store()
        job = data.get("research_jobs", {}).get(job_id)
        if job and job.get("user_id") == user_id:
            return job
        return None

    async def list_research_jobs(self, user_id: str) -> list[dict[str, Any]]:
        data = self._read_local_store()
        return [j for j in data.get("research_jobs", {}).values() if j.get("user_id") == user_id]

    # -------------------------------------------------------------------------
    # Alert Rules
    # -------------------------------------------------------------------------
    async def get_alert_rules(self, user_id: str, token: str | None = None) -> list[dict[str, Any]]:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/alert_rules?user_id=eq.{user_id}",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code == 200:
                        return res.json()
            except Exception as exc:
                logger.warning("Supabase get_alert_rules fallback to local store: %s", exc)

        data = self._read_local_store()
        return [a for a in data.get("alert_rules", {}).values() if a.get("user_id") == user_id]

    async def save_alert_rule(self, rule: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"{settings.supabase_url}/rest/v1/alert_rules",
                        json=rule,
                        headers=self._get_supabase_headers(token),
                    )
            except Exception as exc:
                logger.warning("Supabase save_alert_rule fallback to local store: %s", exc)

        data = self._read_local_store()
        data["alert_rules"][rule["id"]] = rule
        self._write_local_store(data)

    async def delete_alert_rule(self, rule_id: str, user_id: str, token: str | None = None) -> bool:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.delete(
                        f"{settings.supabase_url}/rest/v1/alert_rules?id=eq.{rule_id}&user_id=eq.{user_id}",
                        headers=self._get_supabase_headers(token),
                    )
            except Exception as exc:
                logger.warning("Supabase delete_alert_rule fallback to local store: %s", exc)

        data = self._read_local_store()
        if rule_id in data.get("alert_rules", {}) and data["alert_rules"][rule_id].get("user_id") == user_id:
            del data["alert_rules"][rule_id]
            self._write_local_store(data)
            return True
        return False


db_repo = DatabaseRepository()
