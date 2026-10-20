# Backup and Disaster Recovery Guide

This document describes the backup policies, export mechanisms, and disaster recovery procedures achievable on Supabase's free tier and local Windows storage.

---

## 1. Storage Components & Criticality

| Component | Storage Location | Criticality | Backup Method | Recovery Time Objective (RTO) |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Supabase Managed Cloud | High | Logical pg_dump / SQL Export | < 30 minutes |
| **Auth Users** | Supabase Auth | High | Supabase Auth Export | < 15 minutes |
| **Application Source & Config** | Git & GitHub | Critical | Git commits / GitHub mirrors | < 5 minutes |
| **Research Reports & Portfolios** | User Client Exports | Medium | CSV / JSON Data Exporter | Instant local import |

---

## 2. Supabase Free-Tier Backup Procedures

The Supabase Free Plan provides project pausing after 7 days of inactivity (which can be unpaused at zero cost) and does not include automated daily point-in-time recovery (PITR). Therefore, scheduled logical exports are recommended.

### 2.1 Automated or Manual `pg_dump` Export
Run from Windows PowerShell using the standard PostgreSQL client tools:

```powershell
# Set your Supabase direct connection string
$env:PGPASSWORD = "your-database-password"
pg_dump -h db.yourproject.supabase.co -U postgres -d postgres -F c -b -v -f "supabase_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
```

### 2.2 Schema-Only Export via Supabase CLI
```powershell
supabase db dump --schema public -f schema_backup.sql
```

---

## 3. Disaster Recovery Scenario: Full Cloud Project Reset

If a Supabase hosted project is accidentally deleted or corrupted:

1. **Provision New Project**:
   - Create a new project in the Supabase Dashboard.
   - Obtain the new `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_JWT_SECRET`.
2. **Apply Migrations in Sequence**:
   - Execute the versioned migrations from `supabase/migrations/`:
     1. `20261021000001_initial_schema.sql`
     2. `20261021000002_rls_policies.sql`
     3. `20261021000003_auth_triggers.sql`
3. **Restore User Data**:
   - If a `pg_dump` exists:
     ```powershell
     pg_restore -h db.newproject.supabase.co -U postgres -d postgres -v "supabase_backup_latest.dump"
     ```
4. **Update Application Environment**:
   - Update `.env` on Windows PC and `cloudflare/wrangler.toml`.
   - Redeploy Cloudflare Worker and restart the FastAPI backend.
