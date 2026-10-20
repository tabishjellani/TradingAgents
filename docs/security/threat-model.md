# Security Threat Model: TradingAgents PWA

This document provides a comprehensive threat model for the TradingAgents Progressive Web App (PWA) architecture using STRIDE methodology, identifying trust boundaries, attack vectors, mitigation mechanisms, and operational limitations.

---

## 1. System Architecture & Trust Boundaries

The system is partitioned into four distinct trust zones:

```
[ ZONE 0: Untrusted Client ]
    └── Browser / PWA (React 19, TypeScript, LocalStorage, Cache API, Service Worker)
            │ (HTTPS / Supabase JWT)
            ▼
[ ZONE 1: Edge Perimeter ]
    └── Cloudflare Pages / Workers Gateway
            ├── Rate limiting (IP & user-token sliding window)
            ├── Security headers (CSP, HSTS, X-Content-Type-Options)
            └── Reverse proxy to Python backend (via Cloudflare Tunnel / Direct HTTPS)
            │
            ▼
[ ZONE 2: Trusted Application Server ]
    └── Windows Local / Cloud Python Service (FastAPI, Python 3.10+)
            ├── Supabase JWT signature verification (HMAC-SHA256)
            ├── RBAC enforcement (User, Operator, Admin)
            ├── Research Engine Adapter (bounded execution, thread safety)
            ├── Quantitative Paper Trading Ledger (Decimal precision)
            ├── Server-side Alert Evaluator
            └── Live Trading Safety Manager (Hard-disabled by default, Kill Switch)
            │
            ▼
[ ZONE 3: Managed Persistent Services ]
    ├── Supabase PostgreSQL & Auth (Row Level Security on all 13 user-owned tables)
    └── External Financial & LLM APIs (Yahoo Finance, OpenAI, Anthropic, Gemini, Groq)
```

---

## 2. STRIDE Threat Analysis

### 2.1 Spoofing (Identity & Authentication)
- **Threat**: Attacker creates forged JWT tokens or intercepts unencrypted credentials.
- **Mitigations**:
  - Supabase Auth issues cryptographic JWTs signed with `SUPABASE_JWT_SECRET`.
  - Backend verifies token signature, expiration (`exp`), issuer (`iss`), and audience (`aud`) on every protected route via `backend/app/auth/jwt.py`.
  - No credentials or passwords are ever stored in backend databases; passwords are salted and hashed via Argon2id within Supabase Auth.
  - Refresh tokens are stored in `HttpOnly`, `Secure`, `SameSite=Lax` cookies when running through Supabase client libraries.

### 2.2 Tampering (Data Integrity)
- **Threat 1: Cross-User Ledger or Report Manipulation**
  - An authenticated user attempts to read, modify, or delete another user's research reports, watchlists, paper portfolios, or alert rules by guessing UUIDs.
  - **Mitigation**: Dual-layer defense:
    1. **PostgreSQL Row Level Security (RLS)**: Enforced on all 13 application tables (`profiles`, `watchlists`, `watchlist_items`, `portfolios`, `positions`, `orders`, `research_jobs`, `research_reports`, `backtest_runs`, `alert_rules`, `notifications`, `usage_ledger`, `audit_events`). Every row checks `auth.uid() = user_id`.
    2. **Application-Layer Authorization**: FastAPI dependency `get_current_user` extracts `user_id` from the verified token and enforces ownership before executing any update or delete.
- **Threat 2: Self-Service Role Escalation**
  - An attacker sends a `PATCH /profiles` or modifies token claims to set `role = "admin"`.
  - **Mitigation**: Database migration `20261021000002_rls_policies.sql` provides explicit anti-escalation rules:
    ```sql
    CREATE POLICY "Users cannot update their own role"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (role IS NOT DISTINCT FROM (SELECT role FROM public.profiles WHERE id = auth.uid()));
    ```
    Admin roles can only be granted via direct server-side database administration or secure RPC.

### 2.3 Repudiation (Audit & Traceability)
- **Threat**: Actions such as modifying alerts, resetting paper cash balances, changing admin quotas, or toggling live-trading kill switches are performed without accountability.
- **Mitigations**:
  - The `audit_events` table maintains an append-only log recording `user_id`, `action`, `resource_type`, `resource_id`, `ip_address`, and payload diffs.
  - Live Trading Safety Manager logs all pre-flight risk checks, rejections, order previews, and cancellations with deterministic timestamps.

### 2.4 Information Disclosure (Confidentiality)
- **Threat 1: Accidental Secret Leakage via Web Bundles or Logs**
  - LLM API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`) or Supabase service-role keys leaked in client-side JavaScript or HTTP headers.
  - **Mitigation**:
    - Frontend only consumes `VITE_SUPABASE_ANON_KEY` (which is public by design and restricted by RLS).
    - All AI provider keys, broker credentials, and `SUPABASE_SERVICE_ROLE_KEY` reside exclusively in server-side environment variables on the Python backend host.
    - Research job logs redact prompt templates and sensitive credential headers before returning job status to the client.
- **Threat 2: Service Worker Cache Poisoning**
  - Sensitive reports of user A cached in public device caches accessible to unauthorized users.
  - **Mitigation**: The PWA service worker (`frontend/public/sw.js`) explicitly excludes `/api/v1/auth/*`, `/api/v1/admin/*`, and privileged routes from caching, maintaining a separate user-keyed storage model.

### 2.5 Denial of Service (Availability & Quota Exhaustion)
- **Threat 1: Multi-Agent LLM Job Flooding**
  - An attacker submits 100 concurrent deep-research jobs, consuming the developer's free Gemini/Groq token quotas or exhausting local CPU/memory.
  - **Mitigation**:
    - In-memory async job queue (`backend/app/engine/job_manager.py`) limits concurrent running jobs per user and globally.
    - User quota tracking in `usage_ledger` enforces a daily hard limit (e.g., 5 deep analyses per day for standard users).
    - Edge rate-limiting in `cloudflare/src/index.ts` drops bursts exceeding 60 requests/minute per IP with HTTP 429.
- **Threat 2: Yahoo Finance API Rate Limiting**
  - Continuous quote refreshes trigger IP bans from upstream market data feeds.
  - **Mitigation**: Backend in-memory TTL caching (60 seconds for quotes, 1 hour for daily OHLCV) buffers external calls.

### 2.6 Elevation of Privilege
- **Threat: Path Traversal or Arbitrary Code Execution via Ticker Inputs**
  - An attacker submits a ticker formatted as `../../../../etc/passwd` or command substitution payloads.
  - **Mitigation**: `safe_ticker_component()` in `backend/app/api/v1/market.py` rejects tickers containing `/`, `\`, `..`, `:`, control characters, or non-alphanumeric punctuation before filesystem or provider access.

---

## 3. Residual Risks & Operational Boundaries

1. **Local Windows PC Availability**:
   - In zero-cost personal deployment, the Python research engine runs on the user's local Windows workstation. If the machine enters sleep mode, shuts down, or loses internet connectivity, asynchronous research jobs and background alert schedules will pause.
2. **Third-Party Rate Limits**:
   - Free tiers from Yahoo Finance, Google Gemini, and Groq are subject to undocumented provider throttles. The application fails gracefully with descriptive error banners rather than crashing or returning fake data.
