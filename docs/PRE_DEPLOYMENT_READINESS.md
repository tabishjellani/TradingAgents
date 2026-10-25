# TradingAgents — Pre-Deployment Readiness Assessment

**Repository:** `D:\TradingAgents-main`  
**Current Baseline Commit:** `f906e6b` (`feat(security): implement encrypted AI secrets vault and Admin UI`)  
**Target Migration:** `supabase/migrations/20261025000001_security_hardening.sql`  
**Assessment Date:** 2026-10-25  
**Assessment Mode:** Read-Only Verification  
**Safety Invariant:** `ENABLE_LIVE_TRADING=False` (Strictly Enforced)  
**Readiness Verdict:** ⚠️ **CONDITIONAL READINESS — LOCAL VERIFICATION COMPLETE / PENDING HOSTED SUPABASE PROVISIONING**

---

## 1. Git Repository & Remote Status

### Current Branch and Commit
- **Current Branch:** `main` (synchronized with `origin/main` at commit `f906e6b`).
- **Latest Commit Hash:** `f906e6b`
- **Latest Commit Message:** `feat(security): implement encrypted AI secrets vault and Admin UI`
- **Remote Configuration:**
  - `origin` -> `https://github.com/tabishjellani/TradingAgents.git` (fetch & push)
  - **Credential Safety:** Verified clean; zero plaintext credentials or access tokens are embedded in the remote URI.

### Working Tree State
The working tree contains the security fixes and verification documents implemented locally:

#### Modified Tracked Files
1. `backend/app/api/v1/admin.py`: Persistent server-side audit logging attached to sensitive routes (`/quotas`, `/ai-providers/keys`, `/ai-providers/config`).
2. `backend/app/auth/jwt.py`: Enforced mandatory `iss` claim, PyJWT required claims options, and production `SUPABASE_URL` / `SUPABASE_JWT_SECRET` guards.
3. `backend/app/db/repository.py`: Added `record_audit_event()`, `get_audit_events()`, `get_profile()`, and `create_profile()`.
4. `backend/tests/test_auth_rls.py`: Expanded test suite with 6 new security assertions.
5. `docs/deployment/supabase-setup.md`: Added migration `004` and admin bootstrap documentation.

#### Untracked Files
1. `supabase/migrations/20261025000001_security_hardening.sql`: Security hardening migration.
2. `scripts/bootstrap_admin.py`: CLI admin provisioning script.
3. `backend/tests/test_bootstrap_admin.py`: Admin bootstrap unit test suite.
4. `docs/CRITICAL_SUPABASE_SECURITY_REVIEW.md`: Prior critical vulnerability review document.
5. `docs/SECURITY_PATCH_VERIFICATION.md`: Prior patch verification document.
6. `docs/POST_PUSH_VERIFICATION_REPORT.md`: Post-push verification audit from previous session.

---

## 2. Security Migration Audit & Compatibility

**Target File:** `supabase/migrations/20261025000001_security_hardening.sql`

### Compatibility with Preceding Migrations
The repository defines 4 migrations to be applied in exact chronological sequence:
1. `20261021000001_initial_schema.sql` (Tables, UUID primary keys, check constraints, indexes)
2. `20261021000002_rls_policies.sql` (Initial RLS policies on all 13 tables)
3. `20261021000003_auth_triggers.sql` (`handle_new_user()` trigger for automated user provisioning)
4. `20261025000001_security_hardening.sql` (Security hardening & privilege isolation)

### Detailed Clause-by-Clause Verification

#### A. `public.profiles` Hardening
* **Dropped Permissive Policy:** `DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;`
* **Revoked Client INSERT:** `REVOKE INSERT ON public.profiles FROM anon, authenticated;`
  * **Trigger Compatibility:** In PostgreSQL, function `public.handle_new_user()` is defined with `SECURITY DEFINER SET search_path = public, pg_temp;`. A `SECURITY DEFINER` function executes with the privileges of the database owner, completely bypassing table grant restrictions placed on `anon` or `authenticated`. Therefore, legitimate user signups in `auth.users` continue to insert default profiles (`role = 'user'`, `daily_job_quota = 20`) without issue.
* **Column-Level UPDATE Restriction:**
  ```sql
  REVOKE UPDATE ON public.profiles FROM anon, authenticated;
  GRANT UPDATE (email, updated_at) ON public.profiles TO authenticated;
  ```
  * In PostgreSQL, column-level grants are checked at SQL parse/compilation time. Any client attempt to `UPDATE` `role` or `daily_job_quota` is rejected immediately with error `42501 (permission denied for column "role")`.
* **RLS UPDATE Policy Re-affirmation:** Recreated `"Users can update own profile non-privileged fields"` with RLS `WITH CHECK` as a second defense layer.

#### B. `public.audit_events` Hardening
* **Dropped Permissive Policy:** `DROP POLICY IF EXISTS "Authenticated users and service can insert audit events" ON public.audit_events;`
* **Revoked Client Write Grants:** `REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM anon, authenticated;`
  * Ordinary clients can no longer forge actor IDs, fabricate security events, spoof IPs, or flood database storage.
* **Service-Role Privileges:**
  ```sql
  GRANT ALL ON public.audit_events TO service_role;
  CREATE POLICY "Service role can insert audit events"
  ON public.audit_events FOR INSERT
  TO service_role
  WITH CHECK (true);
  ```
  * The trusted backend retains full authority to append audit trail records using the Supabase `service_role` key.
* **Idempotence & Safety:** All drop statements use `IF EXISTS`. Can be applied safely to a fresh database or an existing staging environment.

---

## 3. Administrator Bootstrap Inspection

**Script:** `scripts/bootstrap_admin.py`  
**Test Suite:** `backend/tests/test_bootstrap_admin.py`

### API & Credential Handling Verification
1. **Supabase Auth Admin API Match:**
   - Queries `GET {supabase_url}/auth/v1/admin/users?per_page=100` with headers `apikey: service_key`, `Authorization: Bearer {service_key}`. Matches standard GoTrue Admin API behavior.
   - Updates user via `PUT {supabase_url}/auth/v1/admin/users/{user_id}` with `{"app_metadata": {"role": "admin"}}`.
2. **PostgREST Profile Synchronization:**
   - Synchronizes `public.profiles` via `PATCH {supabase_url}/rest/v1/profiles?id=eq.{user_id}` with `{"role": "admin", "daily_job_quota": 1000}`.
3. **Pre-Validation & Safe Failure:**
   - If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing: raises `RuntimeError`.
   - If target email does not exist in `auth.users`: raises descriptive `ValueError` informing the operator that the user must register via the frontend first.
4. **Dry-Run Mode:** Passes `--dry-run` to inspect proposed mutations without performing HTTP `PUT` or `PATCH` calls.
5. **Leakage Protection:**
   - `SUPABASE_SERVICE_ROLE_KEY` is loaded from server environment / `.env` and never logged or printed.
   - Script output prints only target email and user UUID.
6. **Token Refresh Explanation:**
   - Explains that because JWT claims are cryptographically signed at login, the promoted administrator must log out and log back in (or refresh session) for the frontend and backend to receive `app_metadata.role = 'admin'`.
7. **Documented SQL Alternative:**
   - The PL/pgSQL block in `docs/deployment/supabase-setup.md` provides an equivalent, safe path for operators using the Supabase Web SQL Editor.

---

## 4. Pytest Warning Source & Impact Analysis

During the execution of `pytest backend/tests/ -v`, exactly 1 warning was emitted:

```text
backend/tests/test_auth_rls.py::test_unsupported_algorithm_rejected
  D:\TradingAgents-main\.venv\Lib\site-packages\jwt\api_jwt.py:149: InsecureKeyLengthWarning:
  The HMAC key is 40 bytes long, which is below the minimum recommended length of 64 bytes for SHA512.
  See RFC 7518 Section 3.2.
    return self._jws.encode(
```

### Technical Root Cause
- In `backend/tests/test_auth_rls.py`, test function `test_unsupported_algorithm_rejected` tests that unsupported algorithms are rejected with `HTTP 401`.
- The test deliberately encodes a test token with `algorithm="HS512"` using `JWT_SECRET = "test-super-secret-jwt-key-32-chars-long!"` (length: 40 bytes).
- RFC 7518 Section 3.2 recommends a minimum key length of 64 bytes (512 bits) for HMAC-SHA512. PyJWT emits an `InsecureKeyLengthWarning` during `jwt.encode()`.

### Security & Runtime Behavior Impact
- **Runtime Impact:** **ZERO.** The application strictly disallows `HS512` at runtime (`backend/app/auth/jwt.py` line 83 rejects any algorithm not in `("HS256", "RS256", "ES256")` with `HTTP 401`). The backend never signs or accepts `HS512` tokens in production.
- **Security Impact:** **ZERO.** The warning occurs only within the test harness while synthesizing an intentionally invalid token. It proves that the test harness exercises PyJWT's strict cryptographic checks.
- **Maintenance Recommendation (Non-Blocking):** In future test refactoring, using a 64-byte key specifically for that negative test case will silence the warning.

---

## 5. Verification Scope: Local vs. Hosted Validation

| Category | Verification Aspect | Local Status | Hosted Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Code Quality** | Python Ruff Linting | **PASS (0 errors)** | N/A | Fully verified locally |
| **Code Quality** | Frontend TypeScript / Vite Build | **PASS (2.80s)** | N/A | Production bundle compiled |
| **Code Quality** | Git Whitespace / Formatting | **PASS** | N/A | `git diff --check` passed |
| **Unit Tests** | 60 Pytest Test Cases | **PASS (60/60)** | N/A | 100% pass rate locally |
| **Authentication** | HS256 JWT Verification | **PASS** | **NOT VERIFIED** | Verified with local secret; needs live Supabase secret |
| **Authentication** | Asymmetric RS256/ES256 (JWKS) | **PASS (Mocked)** | **NOT VERIFIED** | Requires live network fetch from Supabase JWKS URL |
| **Authorization** | `app_metadata` Role Enforcement | **PASS** | **NOT VERIFIED** | Rejects `user_metadata`; requires live session token |
| **Database** | Migration Syntax & Structure | **PASS** | **NOT VERIFIED** | Must be applied to PostgreSQL in hosted Supabase |
| **Database** | Trigger `handle_new_user()` | **PASS (Simulated)**| **NOT VERIFIED** | Requires real user registration on hosted Supabase |
| **Database** | Row Level Security (RLS) Isolation | **PASS (Simulated)**| **NOT VERIFIED** | Enforced by Supabase PostgREST on live database |
| **Key Management**| AES-128-CBC + HMAC-SHA256 Vault | **PASS** | **NOT VERIFIED** | Tested with local keys; requires platform secret env |
| **Admin Setup** | `scripts/bootstrap_admin.py` | **PASS (Mocked)** | **NOT VERIFIED** | Requires live execution against real account |
| **Safety Guard** | `ENABLE_LIVE_TRADING=False` | **PASS** | **PASS** | Hardcoded invariant enforced across all modules |

---

## 6. Pre-Deployment Checklist

### Explicit Blockers (Must Be Completed Before Launch)
1. **Supabase Project Provisioning:**
   - Create project at [supabase.com](https://supabase.com).
   - Retrieve `Project URL`, `anon / public key`, `service_role key`, and `JWT Secret`.
2. **Apply Database Migrations in Exact Sequence:**
   In Supabase Web SQL Editor:
   1. `supabase/migrations/20261021000001_initial_schema.sql`
   2. `supabase/migrations/20261021000002_rls_policies.sql`
   3. `supabase/migrations/20261021000003_auth_triggers.sql`
   4. `supabase/migrations/20261025000001_security_hardening.sql`
3. **Register Initial Administrator:**
   - Start frontend locally or on staging (`http://localhost:5173` or Cloudflare Pages).
   - Sign up the administrator account via `/login`.
4. **Execute Admin Bootstrap:**
   - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in server environment.
   - Run: `python scripts/bootstrap_admin.py --email <admin-email>`
   - Log out and log back in to refresh JWT claims.
5. **Configure AI Provider Keys via Admin UI:**
   - Log into `/admin`.
   - Store encrypted API keys in the vault (Google Gemini, Groq, Anthropic, OpenAI).

### Risks & Operational Considerations
1. **Vault Master Key Persistence:**
   - In production containers (e.g. Render, Railway, Fly.io, Cloudflare), ephemeral disk storage will destroy `data/.vault_key` on redeployment.
   - **Mitigation:** Generate a Fernet key once (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) and store it as the platform environment variable `VAULT_MASTER_KEY`.
2. **Token Freshness After Role Update:**
   - If an admin is promoted while logged in, their active JWT remains unprivileged until refreshed or re-authenticated.
3. **Supabase Free-Tier Pausing:**
   - Inactive Supabase free-tier projects pause after 7 days. Ensure periodic heartbeat or upgrade to Pro for continuous operation.

### Rollback Considerations
- **Git Rollback:** `git revert` or reset to baseline commit `f906e6b`.
- **Database Rollback:** If migration `004` needs to be reverted in SQL Editor:
  ```sql
  -- Rollback Migration 004:
  GRANT INSERT, UPDATE ON public.profiles TO authenticated;
  CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  GRANT INSERT ON public.audit_events TO authenticated;
  CREATE POLICY "Authenticated users and service can insert audit events" ON public.audit_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  ```
- **Vault Rollback:** If master key is compromised or needs reset, remove `data/secrets.enc` and re-enter provider keys in `/admin`.

### Commands Requiring Explicit User Approval
The following commands have NOT been executed and require explicit user approval when ready:
1. `git add -A && git commit -m "feat(security): harden supabase rls, audit events, jwt issuer, and admin bootstrap"`
2. `git push origin main`
3. Running SQL migrations against a hosted Supabase project.
4. `python scripts/bootstrap_admin.py --email admin@example.com` against a live Supabase database.
5. Deploying frontend build artifacts to Cloudflare Pages or backend to cloud compute.

---

## 7. Confirmation of Safety Invariants

- **`ENABLE_LIVE_TRADING`:** Verified `False` in [backend/app/config.py:L43](file:///D:/TradingAgents-main/backend/app/config.py#L43) (`enable_live_trading: bool = False`).
- **`BROKER_SANDBOX_MODE`:** Verified `True` in [backend/app/config.py:L44](file:///D:/TradingAgents-main/backend/app/config.py#L44) (`broker_sandbox_mode: bool = True`).
- **Kill-Switch Invariant:** Verified in [backend/tests/test_live_safety.py](file:///D:/TradingAgents-main/backend/tests/test_live_safety.py).
- **Zero Real Brokerage Orders:** No real brokerage orders can be placed.
