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

### Option A: Using the Supabase Web SQL Editor
1. In the Supabase Dashboard, click **SQL Editor**.
2. Click **New Query**.
3. Copy and paste the contents of `20261021000001_initial_schema.sql` and click **Run**.
4. Repeat for `20261021000002_rls_policies.sql` and `20261021000003_auth_triggers.sql`.

### Option B: Using the Supabase CLI (Local or Remote)
If you have the Supabase CLI installed:

```bash
# Link to your remote project
supabase link --project-ref <your-project-id>

# Push migrations
supabase db push
```

---

## 3. Local Supabase CLI Workflow (with Docker)

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
