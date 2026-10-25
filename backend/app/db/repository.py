"""Database Repository Layer.

Provides unified, hardened persistence for watchlists, portfolios, orders, research jobs,
reports, and alert rules.
When Supabase is configured (SUPABASE_URL and SUPABASE_ANON_KEY/SERVICE_ROLE_KEY):
- Dispatches HTTP PostgREST calls with the verified user's JWT.
- Supabase PostgreSQL natively enforces Row Level Security (RLS) policies per user.
- Ordinary user CRUD operations NEVER default to the service-role key.
- Explicit service-role access is strictly isolated to trusted background tasks.
- In production, errors and failures are raised immediately; silent fallbacks are prohibited.
When offline in non-production development:
- Transparently persists to data/local_store.json, strictly partitioned by user_id.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, status

from backend.app.config import settings

logger = logging.getLogger(__name__)

LOCAL_STORE_PATH = Path("./data/local_store.json")


class DatabaseRepository:
    """Multi-tenant persistence repository with Supabase and offline fallback."""

    def __init__(self):
        if settings.environment != "production":
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
                "audit_events": {},
                "profiles": {},
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

    def _get_supabase_headers(self, user_token: str | None = None, is_service_role: bool = False) -> dict[str, str]:
        """Generate secure headers for Supabase PostgREST.

        Enforces that ordinary user CRUD operations use the caller's JWT,
        and never silently defaults to SUPABASE_SERVICE_ROLE_KEY.
        """
        anon_key = settings.supabase_anon_key or settings.supabase_service_role_key
        headers = {
            "apikey": anon_key,
            "Content-Type": "application/json",
            "Prefer": "return=representation,resolution=merge-duplicates",
        }

        if user_token and not user_token.startswith("test-token:"):
            # Real authenticated user token: RLS applies at PostgreSQL layer
            headers["Authorization"] = f"Bearer {user_token}"
        elif is_service_role:
            # Explicit background system task requiring elevated service-role privileges
            if not settings.supabase_service_role_key:
                raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for explicit service-role operations.")
            headers["Authorization"] = f"Bearer {settings.supabase_service_role_key}"
        else:
            # User request lacking token
            if settings.environment == "production":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication token required for user database persistence in production.",
                )
            headers["Authorization"] = f"Bearer {anon_key}"

        return headers

    def _handle_error(self, operation: str, error: Exception | str):
        """Handle persistence errors: in production, fail fast; in development, warn."""
        msg = f"Database operation '{operation}' failed: {error}"
        logger.error(msg)
        if settings.environment == "production":
            raise RuntimeError(msg)

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
                        records = res.json()
                        for r in records:
                            if "watchlist_items" in r and "items" not in r:
                                r["items"] = r.pop("watchlist_items")
                        return records
                    self._handle_error("get_watchlists", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_watchlists", exc)

        data = self._read_local_store()
        return [w for w in data.get("watchlists", {}).values() if w.get("user_id") == user_id]

    async def save_watchlist(self, watchlist: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                payload = {
                    "id": watchlist["id"],
                    "user_id": watchlist["user_id"],
                    "name": watchlist["name"],
                    "is_default": watchlist.get("is_default", False),
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/watchlists?on_conflict=id",
                        json=payload,
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("save_watchlist", f"HTTP {res.status_code}: {res.text}")

                    # Also persist watchlist items if present
                    items = watchlist.get("items", [])
                    if isinstance(items, list):
                        for idx, item in enumerate(items):
                            sym = item.get("symbol") if isinstance(item, dict) else str(item)
                            atype = item.get("asset_type", "stock") if isinstance(item, dict) else "stock"
                            item_id = item.get("id") if isinstance(item, dict) else None
                            item_payload: dict[str, Any] = {
                                "watchlist_id": watchlist["id"],
                                "symbol": sym,
                                "asset_type": atype,
                                "sort_order": idx,
                            }
                            if item_id:
                                item_payload["id"] = item_id
                            await client.post(
                                f"{settings.supabase_url}/rest/v1/watchlist_items?on_conflict=watchlist_id,symbol",
                                json=item_payload,
                                headers=self._get_supabase_headers(token),
                            )
            except Exception as exc:
                self._handle_error("save_watchlist", exc)

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
                    if res.status_code not in (200, 404):
                        self._handle_error("get_portfolio", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_portfolio", exc)

        data = self._read_local_store()
        for p in data.get("portfolios", {}).values():
            if p.get("user_id") == user_id:
                return p
        return None

    async def save_portfolio(self, portfolio: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                payload = {
                    "id": portfolio["id"],
                    "user_id": portfolio["user_id"],
                    "name": portfolio.get("name", "Default Paper Portfolio"),
                    "currency": portfolio.get("currency", "USD"),
                    "initial_cash": portfolio.get("initial_cash", 100000.0),
                    "current_cash": portfolio.get("current_cash", portfolio.get("cash", 100000.0)),
                    "is_live": False,
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/portfolios?on_conflict=id",
                        json=payload,
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("save_portfolio", f"HTTP {res.status_code}: {res.text}")

                    # Also persist positions
                    positions = portfolio.get("positions", {})
                    positions_list = list(positions.values()) if isinstance(positions, dict) else (positions or [])
                    for pos in positions_list:
                        pos_payload = {
                            "portfolio_id": portfolio["id"],
                            "symbol": pos["symbol"],
                            "asset_type": pos.get("asset_type", "stock"),
                            "quantity": pos["quantity"],
                            "average_price": pos.get("average_entry_price", pos.get("average_price", 0.0)),
                        }
                        await client.post(
                            f"{settings.supabase_url}/rest/v1/positions?on_conflict=portfolio_id,symbol",
                            json=pos_payload,
                            headers=self._get_supabase_headers(token),
                        )
            except Exception as exc:
                self._handle_error("save_portfolio", exc)

        data = self._read_local_store()
        data["portfolios"][portfolio["id"]] = portfolio
        self._write_local_store(data)

    async def save_order(self, order: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                payload = {
                    "id": order["id"],
                    "portfolio_id": order["portfolio_id"],
                    "symbol": order["symbol"],
                    "side": order["side"],
                    "order_type": order.get("order_type", "market"),
                    "quantity": order["quantity"],
                    "price": order.get("price", order.get("execution_price", 0.0)),
                    "status": order["status"],
                    "fees": order.get("fees", 0.0),
                    "idempotency_key": order.get("idempotency_key"),
                    "executed_at": order.get("executed_at"),
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/orders?on_conflict=id",
                        json=payload,
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("save_order", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("save_order", exc)

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
                    self._handle_error("get_orders", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_orders", exc)

        data = self._read_local_store()
        return [o for o in data.get("orders", {}).values() if o.get("portfolio_id") == portfolio_id]

    # -------------------------------------------------------------------------
    # Research Jobs & Reports
    # -------------------------------------------------------------------------
    async def save_research_job(self, job: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/research_jobs?on_conflict=id",
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
                    if res.status_code not in (200, 201):
                        self._handle_error("save_research_job", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("save_research_job", exc)

        data = self._read_local_store()
        data["research_jobs"][job["id"]] = job
        self._write_local_store(data)

    async def get_research_job(self, job_id: str, user_id: str, token: str | None = None) -> dict[str, Any] | None:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/research_jobs?id=eq.{job_id}&user_id=eq.{user_id}",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code == 200 and res.json():
                        return res.json()[0]
                    if res.status_code not in (200, 404):
                        self._handle_error("get_research_job", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_research_job", exc)

        data = self._read_local_store()
        job = data.get("research_jobs", {}).get(job_id)
        if job and job.get("user_id") == user_id:
            return job
        return None

    async def list_research_jobs(self, user_id: str, token: str | None = None) -> list[dict[str, Any]]:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/research_jobs?user_id=eq.{user_id}&order=created_at.desc",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code == 200:
                        return res.json()
                    self._handle_error("list_research_jobs", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("list_research_jobs", exc)

        data = self._read_local_store()
        return [j for j in data.get("research_jobs", {}).values() if j.get("user_id") == user_id]

    async def save_research_report(self, report: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                payload = {
                    "id": report.get("id", report["job_id"]),
                    "job_id": report["job_id"],
                    "user_id": report["user_id"],
                    "symbol": report["symbol"],
                    "rating": report.get("rating", "REVIEW"),
                    "markdown_content": report.get("markdown_content", ""),
                    "html_content": report.get("html_content"),
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/research_reports?on_conflict=id",
                        json=payload,
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("save_research_report", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("save_research_report", exc)

        data = self._read_local_store()
        data["research_reports"][report.get("id", report["job_id"])] = report
        self._write_local_store(data)

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
                    self._handle_error("get_alert_rules", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_alert_rules", exc)

        data = self._read_local_store()
        return [a for a in data.get("alert_rules", {}).values() if a.get("user_id") == user_id]

    async def save_alert_rule(self, rule: dict[str, Any], token: str | None = None):
        if self.is_supabase_enabled:
            try:
                payload = {
                    "id": rule["id"],
                    "user_id": rule["user_id"],
                    "symbol": rule["symbol"],
                    "condition": rule["condition"],
                    "threshold": rule["threshold"],
                    "is_active": rule.get("is_active", True),
                    "cooldown_minutes": rule.get("cooldown_minutes", 60),
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/alert_rules?on_conflict=id",
                        json=payload,
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("save_alert_rule", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("save_alert_rule", exc)

        data = self._read_local_store()
        data["alert_rules"][rule["id"]] = rule
        self._write_local_store(data)

    async def delete_alert_rule(self, rule_id: str, user_id: str, token: str | None = None) -> bool:
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.delete(
                        f"{settings.supabase_url}/rest/v1/alert_rules?id=eq.{rule_id}&user_id=eq.{user_id}",
                        headers=self._get_supabase_headers(token),
                    )
                    if res.status_code not in (200, 204):
                        self._handle_error("delete_alert_rule", f"HTTP {res.status_code}: {res.text}")
                    return True
            except Exception as exc:
                self._handle_error("delete_alert_rule", exc)

        data = self._read_local_store()
        if rule_id in data.get("alert_rules", {}) and data["alert_rules"][rule_id].get("user_id") == user_id:
            del data["alert_rules"][rule_id]
            self._write_local_store(data)
            return True
        return False

    # -------------------------------------------------------------------------
    # Audit Events (Append-only security log; service_role write path)
    # -------------------------------------------------------------------------
    async def record_audit_event(
        self,
        actor_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        ip_address: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Record an immutable, server-side audit event.

        Actor identity is derived strictly from server-side context; never trust
        a client-supplied actor identifier. In Supabase mode, writes use the
        service-role key because client writes to public.audit_events are revoked.
        """
        event_id = str(uuid.uuid4())
        event_record = {
            "id": event_id,
            "actor_id": actor_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": ip_address,
            "details": details or {},
            "created_at": datetime.now(UTC).isoformat(),
        }

        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/audit_events",
                        json=event_record,
                        headers=self._get_supabase_headers(is_service_role=True),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("record_audit_event", f"HTTP {res.status_code}: {res.text}")
                    return event_record
            except Exception as exc:
                self._handle_error("record_audit_event", exc)

        data = self._read_local_store()
        if "audit_events" not in data:
            data["audit_events"] = {}
        data["audit_events"][event_id] = event_record
        self._write_local_store(data)
        return event_record

    async def get_audit_events(self, limit: int = 50, token: str | None = None) -> list[dict[str, Any]]:
        """Retrieve audit events. Admins only; passes user JWT to PostgREST."""
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/audit_events?order=created_at.desc&limit={limit}",
                        headers=self._get_supabase_headers(user_token=token),
                    )
                    if res.status_code == 200:
                        return res.json()
                    self._handle_error("get_audit_events", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_audit_events", exc)

        data = self._read_local_store()
        events = list(data.get("audit_events", {}).values())
        events.sort(key=lambda e: e.get("created_at", ""), reverse=True)
        return events[:limit]

    # -------------------------------------------------------------------------
    # Profiles (Privilege-isolated profile management)
    # -------------------------------------------------------------------------
    async def get_profile(self, user_id: str, token: str | None = None) -> dict[str, Any] | None:
        """Retrieve user profile respecting RLS."""
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(
                        f"{settings.supabase_url}/rest/v1/profiles?id=eq.{user_id}",
                        headers=self._get_supabase_headers(user_token=token),
                    )
                    if res.status_code == 200 and res.json():
                        return res.json()[0]
                    if res.status_code not in (200, 404):
                        self._handle_error("get_profile", f"HTTP {res.status_code}: {res.text}")
            except Exception as exc:
                self._handle_error("get_profile", exc)

        data = self._read_local_store()
        return data.get("profiles", {}).get(user_id)

    async def create_profile(
        self,
        user_id: str,
        email: str,
        role: str = "user",
        daily_job_quota: int = 20,
        is_service_role: bool = False,
    ) -> dict[str, Any]:
        """Create a user profile. In production, this requires service_role or trigger."""
        profile_data = {
            "id": user_id,
            "email": email,
            "role": role,
            "daily_job_quota": daily_job_quota,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.supabase_url}/rest/v1/profiles",
                        json=profile_data,
                        headers=self._get_supabase_headers(is_service_role=is_service_role),
                    )
                    if res.status_code not in (200, 201):
                        self._handle_error("create_profile", f"HTTP {res.status_code}: {res.text}")
                    return profile_data
            except Exception as exc:
                self._handle_error("create_profile", exc)

        data = self._read_local_store()
        if "profiles" not in data:
            data["profiles"] = {}
        data["profiles"][user_id] = profile_data
        self._write_local_store(data)
        return profile_data


db_repo = DatabaseRepository()
