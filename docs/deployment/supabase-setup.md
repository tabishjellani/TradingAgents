# Supabase Setup & Database Migration Guide

This guide describes how to configure Supabase Auth, PostgreSQL schema, and Row Level Security (RLS) policies for TradingAgents PWA, supporting both the free hosted Supabase tier and the local Docker-based Supabase CLI workflow.

---

## 1. Free-Tier Hosted Supabase Setup

### Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project**.
3. Choose a name (e.g. `tradingagents-pwa`), set a secure database password, and select your nearest region.
4. Wait approximately 2 minutes for project provisioning.

### Step 2: Retrieve API Keys & Secrets
1. Navigate to **Project Settings -> API**:
   - Copy **Project URL** -> set as `VITE_SUPABASE_URL` in `frontend/.env`.
   - Copy **anon / public key** -> set as `VITE_SUPABASE_ANON_KEY` in `frontend/.env`.
   - Copy **JWT Secret** -> set as `SUPABASE_JWT_SECRET` in `backend/.env`.

### Step 3: Configure Authentication Settings
1. Navigate to **Authentication -> URL Configuration**:
   - Set **Site URL** to your frontend domain (e.g., `http://localhost:5173` for local testing, or `https://your-app.pages.dev` for production).
   - Under **Redirect URLs**, add:
     - `http://localhost:5173/**`
     - `https://your-app.pages.dev/**`
2. Under **Authentication -> Email Auth**:
   - Ensure **Enable Email provider** is toggled ON.
   - For local development testing, you may optionally toggle OFF **Confirm email** to allow instant logins, or use Supabase's local mailcatcher.

---

## 2. Applying Database Migrations

The migrations are located in `supabase/migrations/` and must be applied in sequential order:

1. `20261021000001_initial_schema.sql` (Creates all 13 core application tables, UUID primary keys, check constraints, foreign keys, and indexes).
2. `20261021000002_rls_policies.sql` (Enables Row Level Security on all 13 tables, defines user isolation, and prevents self-service role escalation).
3. `20261021000003_auth_triggers.sql` (Installs PostgreSQL triggers to automatically create a user profile in `public.profiles` whenever a new user signs up in `auth.users`).
4. `20261025000001_security_hardening.sql` (Revokes client INSERT on `public.profiles` and `public.audit_events`, restricts profile updates to non-privileged columns, and isolates audit trail writes strictly to server-side processes).

### Option A: Using the Supabase Web SQL Editor
1. In the Supabase Dashboard, click **SQL Editor**.
2. Click **New Query**.
3. Copy and paste the contents of `20261021000001_initial_schema.sql` and click **Run**.
4. Repeat in sequence for:
   - `20261021000002_rls_policies.sql`
   - `20261021000003_auth_triggers.sql`
   - `20261025000001_security_hardening.sql`

### Option B: Using the Supabase CLI (Local or Remote)
If you have the Supabase CLI installed:

```bash
# Link to your remote project
supabase link --project-ref <your-project-id>

# Push migrations
supabase db push
```

---

## 3. Initial Administrator Provisioning & Bootstrap

By default, every newly registered user receives the unprivileged `'user'` role in both `auth.users.raw_app_meta_data` and `public.profiles`. The backend RBAC strictly inspects `app_metadata.role = 'admin'` from verified JWT claims.

To promote an initial user to administrator:

### Prerequisites
1. The administrator must first register an account via the frontend app (`/login` -> Sign Up) with their email address.
2. The user must exist in `auth.users`.

### Method A: Using the Server-Side Bootstrap CLI Script
On your backend host (with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in `.env`):

```bash
# Dry run first to verify
python scripts/bootstrap_admin.py --email admin@example.com --dry-run

# Promote user to administrator
python scripts/bootstrap_admin.py --email admin@example.com
```

### Method B: Using the Supabase Web SQL Editor Directly
In the Supabase Dashboard SQL Editor, run:

```sql
DO $$
DECLARE
    target_email TEXT := 'admin@example.com'; -- Replace with administrator's email
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User % not found. User must register via frontend first.', target_email;
    END IF;

    -- 1. Assign trusted server-side role claim in Supabase Auth
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
    WHERE id = target_user_id;

    -- 2. Update public profile record for consistency
    UPDATE public.profiles
    SET role = 'admin', daily_job_quota = 1000
    WHERE id = target_user_id;

    RAISE NOTICE 'User % (UUID: %) successfully promoted to admin.', target_email, target_user_id;
END $$;
```

> **IMPORTANT:** Because Supabase JWT claims are signed upon authentication, the promoted user **must log out and log back in** (or trigger a session refresh) to receive a new JWT containing the elevated `app_metadata.role: admin` claim.

---

## 4. Local Supabase CLI Workflow (with Docker)

For developers who want a completely offline local database stack:

1. Ensure **Docker Desktop** for Windows is running.
2. Initialize Supabase locally:
   ```powershell
   supabase init
   supabase start
   ```
3. The CLI will output local credentials:
   - API URL: `http://127.0.0.1:54321`
   - Anon Key: (local JWT)
   - Secret Key: (local service role)
   - Studio URL: `http://127.0.0.1:54323`
4. Apply migrations:
   ```powershell
   supabase migration up
   ```

---

## 4. Database Schema Reference

The 13 logical tables deployed:
1. `public.profiles` - User display name, role (`user`, `operator`, `admin`), avatar URL.
2. `public.watchlists` - User-owned symbol collections.
3. `public.watchlist_items` - Symbols, target price, sort order within watchlists.
4. `public.portfolios` - Paper portfolios with cash ledger balance and starting capital.
5. `public.positions` - Reconciled quantity, average entry price, realized P&L per symbol.
6. `public.orders` - Paper and sandbox order history with execution status and fees.
7. `public.research_jobs` - Async multi-agent job state, ticker, model, status, milestones.
8. `public.research_reports` - Persisted Markdown reports, analyst debates, final recommendations.
9. `public.backtest_runs` - Historical simulation parameters, metrics (Sharpe, CAGR, Drawdown).
10. `public.alert_rules` - Price thresholds, percentage changes, recurring rules, cooldowns.
11. `public.notifications` - In-app notification messages delivered to users.
12. `public.usage_ledger` - Token usage, analysis counts, quota consumption per user.
13. `public.audit_events` - Tamper-evident administrative and security audit trail.
