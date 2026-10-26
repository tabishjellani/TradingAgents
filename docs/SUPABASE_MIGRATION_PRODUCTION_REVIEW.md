# Supabase Migration Production Readiness Audit

**Target Migration:** `supabase/migrations/20261025000001_security_hardening.sql`  
**Repository:** `D:\TradingAgents-main`  
**Current Baseline Commit:** `642a7bf` (pushed to `origin/main`)  
**Assessment Date:** 2026-10-25  
**Reviewer Role:** Senior Security & Database Reliability Engineer  
**Mode:** Read-Only Static Architecture & Security Verification  

---

## Executive Summary & Final Recommendation

### **FINAL RECOMMENDATION: READY FOR TEST ENVIRONMENT**

Migration `20261025000001_security_hardening.sql` successfully closes critical self-service privilege escalation and audit trail tampering vulnerabilities without breaking existing authentication, registration, or application workflows.

- **Sequence & Dependency Integrity:** The migration is definitively the **fourth migration** and strictly requires migrations 001, 002, and 003 to be applied first.
- **Signup & Profile Creation Preservation:** The PostgreSQL signup trigger `public.handle_new_user()` operates with `SECURITY DEFINER`, ensuring that new user account creation remains fully functional even with client table `INSERT` privileges revoked.
- **Privilege Isolation:** Client writes to `public.audit_events` and sensitive columns of `public.profiles` (`role`, `daily_job_quota`) are completely revoked. All administrative events are routed strictly through the backend's service-role path with verified JWT identities.
- **Rollback Feasibility:** A complete SQL rollback script is provided with documented limitations regarding immutable audit history and user state.
- **Deployment Recommendation:** Deploy and test on a **Supabase staging/test environment** first to validate PostgREST column grant handling and GoTrue trigger execution before applying to production.

---

## 1. Findings Matrix by Severity

| Finding ID | Severity | Category | Description | Status / Impact |
| :--- | :---: | :--- | :--- | :--- |
| **SEC-AUD-01** | Informational | Schema Integrity | Strict sequential dependency on migrations 001, 002, and 003. Cannot be run out of order. | **PASS** — Verified dependency chain. |
| **SEC-AUD-02** | Informational | Auth & RLS | Revoking client INSERT on `public.profiles` does not impact signup trigger. | **PASS** — `handle_new_user()` executes as `SECURITY DEFINER`. |
| **SEC-AUD-03** | Informational | Data Integrity | PostgREST column-level grant enforcement rejects payloads containing ungranted fields. | **PASS** — Neither frontend nor backend attempts client profile mutation. |
| **SEC-AUD-04** | Low | Operations | `scripts/bootstrap_admin.py` queries `per_page=100` without pagination. | **DOCUMENTED** — Target admin must be in the first 100 users or boosted during setup. |
| **SEC-AUD-05** | Informational | Authentication | Admin bootstrap role requires user re-authentication to refresh JWT claims. | **DOCUMENTED** — Standard GoTrue JWT claim behavior. |

---

## 2. Migration Sequence & Exact Dependencies

### 2.1 Confirmed Migration Sequence

The repository contains four physical migration scripts in `supabase/migrations/`:

```
1. 20261021000001_initial_schema.sql
2. 20261021000002_rls_policies.sql
3. 20261021000003_auth_triggers.sql
4. 20261025000001_security_hardening.sql
```

### 2.2 Proof of Functional Dependency (Why it is Definitively Migration 004)

`20261025000001_security_hardening.sql` is not merely the fourth file by timestamp; its SQL instructions strictly depend on the artifacts created by all three prior migrations:

1. **Dependency on Migration 001 (`initial_schema.sql`):**
   - References `public.profiles` and `public.audit_events`.
   - Modifies column privileges on `(email, updated_at)`.
   - *Failure Mode if 001 is missing:* Execution aborts with PostgreSQL error `relation "public.profiles" does not exist`.
2. **Dependency on Migration 002 (`rls_policies.sql`):**
   - Explicitly drops policies established in Migration 002:
     - `DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;` (002, line 31)
     - `DROP POLICY IF EXISTS "Users can update own profile non-privileged fields" ON public.profiles;` (002, line 36)
     - `DROP POLICY IF EXISTS "Authenticated users and service can insert audit events" ON public.audit_events;` (002, line 147)
     - `DROP POLICY IF EXISTS "Admins can view audit events" ON public.audit_events;` (002, line 141)
   - *Failure Mode if 002 is run after 004:* Migration 002 would re-introduce the vulnerable `"Users can insert own profile"` and `"Authenticated users and service can insert audit events"` policies, undoing the hardening.
3. **Dependency on Migration 003 (`auth_triggers.sql`):**
   - Revokes client `INSERT` on `public.profiles`. The system relies exclusively on `public.handle_new_user()` to populate profile records upon user registration.
   - *Failure Mode if 003 is missing:* New user signups would succeed in `auth.users`, but profile creation would fail silently or orphan user records, breaking user onboarding.

---

## 3. Security Hardening Analysis

### 3.1 Signup & Profile Creation Preservation
- **Mechanism:** Migration 004 executes `REVOKE INSERT ON public.profiles FROM anon, authenticated;`.
- **Trigger Verification:** `public.handle_new_user()` in Migration 003 is declared as:
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
      INSERT INTO public.profiles (id, email, role, daily_job_quota, created_at, updated_at)
      VALUES (new.id, COALESCE(new.email, 'unknown@example.com'), 'user', 20, now(), now());
      ...
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
  ```
- **Privilege Evaluation:**
  - `SECURITY DEFINER` causes the trigger function to execute with the privileges of its owner (`postgres` / `supabase_admin`), which possesses superuser table privileges on `public.profiles`.
  - The table-level `REVOKE` on `anon` and `authenticated` roles only affects direct client PostgREST calls (e.g. `supabase.from('profiles').insert(...)`).
  - **Verdict:** Legitimate user registrations via `supabase.auth.signUp()` continue to create profile records, watchlists, and paper portfolios without interruption.

### 3.2 Security Definer Safety (`search_path`)
- Migration 003 explicitly includes `SET search_path = public, pg_temp;`.
- **Finding:** This eliminates PostgreSQL search-path hijacking attacks (CWE-426), ensuring that malicious actors cannot override referenced operators or tables by manipulating the schema search path.

### 3.3 Column-Level UPDATE Grants & Defense-in-Depth RLS
- **Column Grants:**
  ```sql
  REVOKE UPDATE ON public.profiles FROM anon, authenticated;
  GRANT UPDATE (email, updated_at) ON public.profiles TO authenticated;
  ```
- **RLS Policy:**
  ```sql
  CREATE POLICY "Users can update own profile non-privileged fields"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
      auth.uid() = id
      AND (
          (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
          OR (role = 'user' AND daily_job_quota <= 20)
      )
  );
  ```
- **PostgREST Behavior:** When PostgREST receives an `UPDATE`/`PATCH` request from an authenticated client, PostgreSQL verifies that the client has column UPDATE privilege for all columns specified in the payload. If an authenticated user attempts to modify `role`, `daily_job_quota`, or `id`, PostgreSQL immediately returns `42501` (permission denied).
- **Application Compatibility:** The frontend application does not perform direct profile mutations (user details are read-only via `/api/v1/user/profile`). Admin updates are executed via `scripts/bootstrap_admin.py` using `service_role` authorization (`GRANT ALL ON public.profiles TO service_role;`).

### 3.4 Audit Trail Authenticity & Client Forgery Prevention
- **Write Path Revocation:**
  ```sql
  REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM anon, authenticated;
  GRANT ALL ON public.audit_events TO service_role;
  ```
- **Service Role Enforcement:**
  - Audit event insertion policy:
    ```sql
    CREATE POLICY "Service role can insert audit events"
    ON public.audit_events FOR INSERT
    TO service_role
    WITH CHECK (true);
    ```
  - Backend write path in `backend/app/db/repository.py`:
    ```python
    await client.post(
        f"{settings.supabase_url}/rest/v1/audit_events",
        json=event_record,
        headers=self._get_supabase_headers(is_service_role=True),
    )
    ```
- **Actor Identity Verification:** In `backend/app/api/v1/admin.py`, `actor_id` is derived strictly from `admin.id` (the validated user ID from the cryptographically verified JWT). Client payloads cannot supply or spoof an arbitrary `actor_id`.
- **Read Path Isolation:** Only users possessing verified `app_metadata.role = 'admin'` in their JWT can query audit events via PostgREST.

---

## 4. Admin Bootstrap Script Safety Review

The script [`scripts/bootstrap_admin.py`](file:///D:/TradingAgents-main/scripts/bootstrap_admin.py) was audited for runtime correctness and potential race conditions:

1. **Credential Validation:** Fails immediately with `RuntimeError` if either `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing from the environment.
2. **Account Pre-existence Requirement:** Queries the GoTrue Admin API (`/auth/v1/admin/users`) to verify the target user exists. It will not create phantom accounts.
3. **Exact Email Matching:** Matches strictly on `u.get("email", "").lower() == email.lower()`.
4. **Pagination Limitation (Finding SEC-AUD-04):** The API query specifies `params={"per_page": 100}`. In a database with more than 100 registered users, if the target administrator account is not in the first 100 users returned, the script will raise `ValueError("User with email ... was not found")`.
   - *Recommendation:* For initial deployments or test environments, this is completely non-blocking. For large existing databases, filter by user ID or pass specific query parameters.
5. **Dry Run Support:** The `--dry-run` flag performs all lookups and prints intended updates without mutating remote state.
6. **Two-Way Synchronization:** Updates both `auth.users.raw_app_meta_data` (for JWT issuance) and `public.profiles.role` (for database consistency).

---

## 5. Potential Regressions & Failure Modes

| Flow | Potential Regression | Verification & Protection | Risk |
| :--- | :--- | :--- | :---: |
| **New User Registration** | Direct profile insert blocked | Trigger executes with `SECURITY DEFINER`, bypassing client table grant revocations. | **None** |
| **User Login & Session** | Token rejection on missing claims | `jwt.py` accepts valid GoTrue tokens with standard issuer, audience, and expiry. | **None** |
| **User Profile Fetch** | Profile access denied by RLS | `Users can view own profile or admins view all` policy remains active. | **None** |
| **Admin Quota / Key Update**| Audit record creation fails | Server-side write uses `is_service_role=True`. Tested and passed in `test_auth_rls.py`. | **None** |
| **Client Audit Spoofing** | Forged audit events accepted | Explicitly revoked at table level and blocked by RLS. | **Mitigated** |

---

## 6. Pre-Migration Checklist & Backup Plan

Before applying Migration 004 to a hosted Supabase environment:

### 6.1 Pre-Migration Backup
Execute a full schema and data dump of the target database:
```bash
# Using Supabase CLI:
supabase db dump -f pre_migration_004_backup.sql

# Or using pg_dump directly:
pg_dump -h db.<project-ref>.supabase.co -U postgres -d postgres -F p -b -v -f pre_migration_004_backup.sql
```

### 6.2 Pre-Migration Verification
- [ ] Confirm migrations `001`, `002`, and `003` are already applied to the target project.
- [ ] Confirm no client applications depend on direct `supabase.from('profiles').insert()`.
- [ ] Ensure backend environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provisioned on the host.

---

## 7. Migration Application & Testing Plan

### Step 1: Apply Migration 004
In the Supabase SQL Editor or via Supabase CLI:
```bash
supabase db push
```

### Step 2: Verify Grants and Policies
Run the following verification query in the Supabase SQL Editor:
```sql
-- 1. Verify table grants
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name IN ('profiles', 'audit_events')
ORDER BY table_name, grantee;

-- 2. Verify column grants on profiles
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_name = 'profiles';

-- 3. Verify active policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'audit_events');
```
*Expected Result:*
- `anon` and `authenticated` have no table-level `INSERT` or `UPDATE` on `profiles` or `audit_events`.
- `authenticated` has column-level `UPDATE` on `email` and `updated_at`.
- `service_role` has `ALL` on both tables.

### Step 3: End-to-End Functional Test in Hosted Project
1. **Signup Test:** Register a new user (`test-user@example.com`) through the frontend UI or GoTrue API. Confirm that a record appears in `public.profiles` with `role = 'user'` and `daily_job_quota = 20`.
2. **Profile Escalation Prevention Test:** Using the user's JWT in PostgREST, attempt:
   ```bash
   PATCH /rest/v1/profiles?id=eq.<user-id>
   {"role": "admin"}
   ```
   *Expected Result:* HTTP 403 Forbidden (`permission denied for column role`).
3. **Audit Injection Prevention Test:** Using the user's JWT in PostgREST, attempt:
   ```bash
   POST /rest/v1/audit_events
   {"action": "FORGED_EVENT", "resource_type": "security"}
   ```
   *Expected Result:* HTTP 403 Forbidden (`permission denied for relation audit_events`).
4. **Admin Bootstrap Test:**
   ```bash
   python scripts/bootstrap_admin.py --email admin@example.com --dry-run
   python scripts/bootstrap_admin.py --email admin@example.com
   ```
   *Expected Result:* User promoted; re-login yields JWT with `app_metadata.role: admin`.

---

## 8. Rollback Plan & Operational Limitations

### 8.1 Rollback SQL Script (`20261025000001_rollback.sql`)

If immediate rollback of Migration 004 is required, execute the following script in the Supabase SQL Editor:

```sql
-- ============================================================================
-- Rollback for Migration 004: Restores Migration 002 Permissions
-- ============================================================================

-- 1. Restore public.profiles permissions
GRANT INSERT, UPDATE ON public.profiles TO anon, authenticated;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile non-privileged fields" ON public.profiles;
CREATE POLICY "Users can update own profile non-privileged fields"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR (role = 'user' AND daily_job_quota <= 20)
    )
);

-- 2. Restore public.audit_events permissions
GRANT INSERT ON public.audit_events TO anon, authenticated;

DROP POLICY IF EXISTS "Service role can insert audit events" ON public.audit_events;
DROP POLICY IF EXISTS "Authenticated users and service can insert audit events" ON public.audit_events;
CREATE POLICY "Authenticated users and service can insert audit events"
ON public.audit_events FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can view audit events" ON public.audit_events;
CREATE POLICY "Admins can view audit events"
ON public.audit_events FOR SELECT
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
```

### 8.2 Rollback Limitations
1. **Irreversible Data Modifications:**
   - Any users promoted to `admin` via `scripts/bootstrap_admin.py` or SQL while Migration 004 was active will **retain** their admin role in `auth.users.raw_app_meta_data`. To demote a promoted user, run:
     ```sql
     UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'role' WHERE email = 'target@example.com';
     UPDATE public.profiles SET role = 'user', daily_job_quota = 20 WHERE email = 'target@example.com';
     ```
2. **Audit Event History:**
   - Audit events written by server operations during the active period remain stored in `public.audit_events` and will not be altered by the permission rollback.
3. **Security Exposure:**
   - Executing the rollback immediately restores the ability for authenticated clients to inject arbitrary audit logs and attempt profile updates.

---

## 9. Tests Requiring a Hosted Supabase Project

The following verification scenarios cannot be validated with local unit tests or mocks and **must** be confirmed on a hosted Supabase test project:

| Test Case | Hosted Requirement |
| :--- | :--- |
| **GoTrue User Signup Trigger** | Verifies that PostgreSQL `AFTER INSERT ON auth.users` fires reliably when accounts are registered through the Supabase GoTrue Auth service. |
| **PostgREST Column Privilege Enforcement** | Verifies that PostgREST properly formats HTTP 403 error responses when a client submits updates targeting non-granted columns (`role`, `daily_job_quota`). |
| **Live GoTrue JWKS Endpoint** | Confirms that GoTrue issues JWTs matching the project URL issuer and that public keys are accessible at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. |
| **Service Role Key PostgREST Bypass** | Confirms that the hosted PostgREST instance permits audit event insertions using `apikey: <service-role-key>`. |
| **Admin Bootstrap GoTrue API** | Validates live network compatibility with `PUT /auth/v1/admin/users/{user_id}` and subsequent JWT claim reflection upon session refresh. |
