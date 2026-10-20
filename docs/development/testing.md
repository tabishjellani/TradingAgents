# Testing Guide & Acceptance Verification

This guide outlines the testing philosophy, test organization, automated suites, fixture conventions, and reproduction commands for TradingAgents PWA.

---

## 1. Test Suite Architecture

The project maintains two decoupled test layers to guarantee reliability without requiring external internet access:

1. **Backend Integration & Unit Tests (`backend/tests/`)**:
   - Written with `pytest` and `pytest-asyncio`.
   - Uses FastAPI's `httpx.AsyncClient` with `ASGITransport`.
   - Evaluates authentication, authorization, RLS boundary logic, path-traversal input sanitation, paper-trading `Decimal` math, live-trading safety gates, and background job lifecycles using synthetic fixtures.
   - Requires zero network calls in standard execution.
2. **Frontend Type Checking & Build Verification (`frontend/`)**:
   - TypeScript 5.8 strict compiler checks (`tsc -b`).
   - Vite 6 production bundle compilation verifying asset bundling, service-worker registration, and PWA manifest validity.

---

## 2. Running Backend Tests

Run all 27 tests from the root directory using the virtualenv Python runner:

```powershell
.\.venv\Scripts\pytest.exe backend/tests/ -v
```

### Test Suite Directory Layout:
- `backend/tests/test_health.py` (3 tests):
  - Root `/health` health-check endpoint.
  - API v1 `/api/v1/health` endpoint.
  - `/api/v1/system-info` operational metadata.
- `backend/tests/test_auth_rls.py` (7 tests):
  - Rejection of unauthenticated requests with HTTP 401.
  - Acceptance of valid cryptographic JWTs with HTTP 200.
  - Role-based denial of standard users attempting admin endpoints (HTTP 403).
  - Proper granting of admin permissions to verified admin tokens.
  - Rejection of malformed / signature-mismatched JWTs.
  - Rejection of expired tokens.
  - Cross-user tenant isolation check.
- `backend/tests/test_market_api.py` (4 tests):
  - Stock quote retrieval with synthetic fallback.
  - Cryptocurrency symbol normalization (`BTC-USD`, `ETH-USD`).
  - Path traversal defense testing malicious tickers (`...`, `foo..bar`).
  - Watchlist creation, listing, item insertion, and deletion.
- `backend/tests/test_research_api.py` (3 tests):
  - Multi-agent research job submission, status polling, and markdown report fetch.
  - Tenant isolation preventing user B from reading user A's research jobs.
  - Graceful job cancellation.
- `backend/tests/test_portfolio_backtest_api.py` (3 tests):
  - Exact `Decimal` precision accounting (verifying $0.10 + $0.20 == $0.30 without float drift, slippage, and fee deduction).
  - Paper portfolio creation, order placement, position tracking.
  - Backtesting parameter grid evaluation.
- `backend/tests/test_alerts_admin_export.py` (4 tests):
  - CWE-1236 CSV Formula Injection sanitization (`=`, `+`, `-`, `@` escaped with `'`).
  - Server-side alert evaluator triggering on price thresholds with cooldown suppression.
  - Alert rule CRUD and notification delivery.
  - Admin telemetry and quota adjustments.
- `backend/tests/test_live_safety.py` (3 tests):
  - Hard-disabled default live trading check.
  - Instantaneous Emergency Kill Switch aborting all submissions.
  - Pre-flight risk limit engine (notional caps, position limits, freshness).

---

## 3. Running Upstream Baseline Tests

To verify compatibility with upstream `TradingAgents` v0.7.0 core algorithms:

```powershell
.\.venv\Scripts\pytest.exe tests/ -m "not network and not slow" -v
```
*(Baseline: 1,353 passed upstream tests).*

---

## 4. Running Frontend Verification

```powershell
cd frontend
# TypeScript check & production build
npm run build
```
Verify that the output generates `dist/index.html` and `dist/sw.js` with zero compiler errors.
