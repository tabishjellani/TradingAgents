# TradingAgents PWA: Implementation Plan (Phases 0 - 9)

## 1. Overview & Phasing Strategy

To transform TradingAgents v0.7.0 into a secure, production-grade Progressive Web App without regressions, development proceeds across ten structured phases. Each phase concludes with automated test validation, changed files accounting, and operational checks.

---

## 2. Phase-by-Phase Roadmap

### Phase 0: Repository Audit & Planning (Completed)
- **Scope**:
  - Read-only audit of Git status, dependencies, package layout, entry points, and capabilities.
  - Baseline execution of test suite (1,353 passing tests, 5 Windows test-harness POSIX gaps identified).
  - Production of `docs/architecture/repository-audit.md`, `system-design.md`, `implementation-plan.md`, `requirements-traceability.md`.
- **Deliverables**: Audit documentation, baseline test report, git branch `pwa-fullstack`.

---

### Phase 1: Foundation (Backend API Scaffold & Frontend PWA Setup)
- **Scope**:
  - Establish `backend/` directory with FastAPI, Pydantic v2 schemas, configuration management, and health check endpoints.
  - Establish `frontend/` directory with Vite, React 19, TypeScript, Vanilla CSS design tokens, and base layout.
  - Setup unified npm and PowerShell development scripts (`start-dev.ps1`, `test-all.ps1`).
  - Configure `.github/workflows/ci.yml` to lint and test both frontend and backend.
- **Verification**:
  - `pytest backend/tests/test_health.py` passes.
  - `npm run build` in `frontend/` compiles with 0 TypeScript/lint errors.
  - Dev servers run and communicate on localhost.

---

### Phase 2: Authentication & Database (Supabase Integration)
- **Scope**:
  - Author version-controlled SQL migrations in `supabase/migrations/`:
    - `001_initial_schema.sql`: tables for `profiles`, `watchlists`, `watchlist_items`, `portfolios`, `positions`, `orders`, `research_jobs`, `research_reports`, `backtest_runs`, `alert_rules`, `notifications`, `usage_ledger`, `audit_events`.
    - `002_rls_policies.sql`: Strict Row Level Security policies for all user-owned tables.
    - `003_triggers.sql`: User profile creation trigger on `auth.users` insert.
  - Implement Supabase Auth client in `frontend/src/lib/supabase.ts` (Login, Register, Password Reset, Session Listener).
  - Implement Supabase JWT verification dependency in `backend/app/auth/`.
  - Add backend RLS and cross-user denial tests using mock JWTs.
- **Verification**:
  - Python tests prove unauthorized or cross-user requests receive HTTP 401/403.
  - Migration script validates cleanly against SQL schema parser.

---

### Phase 3: Real Research Engine Integration
- **Scope**:
  - Implement `backend/app/engine/adapter.py`: Thread-safe, non-blocking wrapper around upstream `TradingAgentsGraph.propagate()`.
  - Implement persistent job lifecycle manager (`queued` → `running` → `completed` | `failed` | `cancelled`).
  - Implement SSE (Server-Sent Events) or status polling endpoint `/api/v1/research/jobs/{id}` for live progress.
  - Connect verified free AI providers (Gemini 3.8 Flash, Groq, Ollama) and fallback logic.
  - Implement report persistence into Supabase `research_reports` table (Markdown and HTML formats).
  - Build Frontend Research Workspace (`frontend/src/pages/Research.tsx`): Submission form, agent progress indicators, report viewer, and debate inspector.
- **Verification**:
  - Automated test executing a simulated analysis job through the adapter and asserting report persistence.
  - Integration test verifying free provider setup validation and error handling when keys are omitted.

---

### Phase 4: Market Dashboard & Watchlists
- **Scope**:
  - Build `backend/app/api/v1/market.py`: Keyless Yahoo Finance adapter for real-time/delayed quotes, historical OHLCV data, company summaries, and crypto symbols.
  - Data freshness indicators: Explicitly badge delayed vs. active market data and source timestamps.
  - Implement Watchlist CRUD API and Supabase queries.
  - Build Frontend Market Dashboard (`frontend/src/pages/Dashboard.tsx`):
    - Symbol search (equities & crypto).
    - Interactive Candlestick charts with volume and technical indicators.
    - User watchlists with reordering and symbol removal.
- **Verification**:
  - Backend tests verifying symbol normalization (stocks vs. crypto) via `safe_ticker_component()`.
  - Frontend component tests for chart rendering, loading, and error states.

---

### Phase 5: Backtesting Lab & Paper Trading
- **Scope**:
  - Wrap upstream `tradingagents.backtest:run_backtest` for decision evaluation grid runs.
  - Build Quantitative Paper Trading Engine (`backend/app/engine/paper_trading.py`):
    - Portfolio creation (cash, currency).
    - Order execution (Market/Limit, Buy/Sell, slippage modeling, fee calculation).
    - Realized/unrealized P&L calculation using exact `Decimal` precision.
    - Transaction history ledger.
  - Build Frontend Paper Trading & Backtesting UI (`frontend/src/pages/Portfolio.tsx`, `Backtest.tsx`):
    - Holdings table, trade placement modal, equity curve chart, backtest hit-rate matrix.
- **Verification**:
  - Unit tests for paper trading accounting (no floating-point rounding errors, accurate cash subtraction and position sizing).
  - Deterministic fixture tests for backtesting calculations.

---

### Phase 6: Alerts, Administration & Secure Exports
- **Scope**:
  - Implement background alert evaluator (`backend/app/engine/alert_evaluator.py`) checking user rules against current market prices.
  - Implement in-app notifications and cooldown logic to prevent notification spam.
  - Implement Secure Admin API and Dashboard (`frontend/src/pages/Admin.tsx`):
    - User list, role management, quota updates, service health, and audit event logs.
    - Server-side role enforcement (reject client-supplied admin flags).
  - Implement Export Engine (`backend/app/services/exporter.py`):
    - CSV exports sanitized against spreadsheet formula injection (stripping leading `=`, `+`, `-`, `@`).
    - JSON structured export for research reports and trade history.
    - Single-page HTML report export.
- **Verification**:
  - Formula injection unit tests verifying malicious cells are neutralized.
  - Role-escalation prevention test asserting regular users cannot access `/api/v1/admin/*`.

---

### Phase 7: PWA & Offline Functionality
- **Scope**:
  - Author `frontend/public/manifest.webmanifest` and generate standard icon assets (192x192, 512x512, maskable).
  - Implement Service Worker (`frontend/src/sw.ts`):
    - Cache app shell and static bundles.
    - Offline fallback for navigation routes.
    - Save research reports to local IndexedDB for reliable offline consultation.
    - Stale-while-revalidate strategy for UI assets.
  - Display clear offline badging and synchronization status.
  - Add service worker update notification banner with "Refresh to update" trigger.
- **Verification**:
  - Lighthouse PWA audit compliance.
  - Automated browser test asserting offline availability of previously viewed reports.

---

### Phase 8: Live Trading Safety Architecture (Disabled by Default)
- **Scope**:
  - Define provider-neutral broker execution interface (`backend/app/engine/broker_interface.py`).
  - Implement strict 4-tier safety model: Research, Paper, Sandbox, Live.
  - Enforce Live Mode hard-disabled in settings (`ENABLE_LIVE_TRADING=False`).
  - Implement Risk Checks engine: Max order notional, daily loss threshold, position limits, fresh quote verification.
  - Implement Emergency Kill Switch endpoint (`POST /api/v1/trading/kill-switch`).
  - Mock broker sandbox integration test proving live orders cannot execute without triple authorization.
- **Verification**:
  - Unit test proving order execution fails closed when `ENABLE_LIVE_TRADING` is false.
  - Test asserting kill switch instantly aborts pending transactions.

---

### Phase 9: Release Readiness & Documentation
- **Scope**:
  - Execute end-to-end regression test suite across frontend, backend, database, and adapters.
  - Complete full documentation suite:
    - `README.md`
    - `docs/security/threat-model.md`
    - `docs/security/secrets-and-credentials.md`
    - `docs/security/live-trading-safety.md`
    - `docs/deployment/windows-setup.md`
    - `docs/deployment/supabase-setup.md`
    - `docs/deployment/cloudflare-setup.md`
    - `docs/deployment/github-ci-cd.md`
    - `docs/deployment/free-tier-and-costs.md`
    - `docs/development/testing.md`
    - `docs/operations/troubleshooting.md`
    - `docs/operations/backup-and-recovery.md`
    - `docs/licensing/upstream-attribution.md`
  - Produce final acceptance report with command execution logs and test results.
- **Verification**:
  - Clean CI pass across Python tests, TypeScript build, and security scans.
