# Secrets and Credentials Management Guide

This document outlines the strict policies, storage mechanisms, rotation workflows, and operational procedures for all secrets, API keys, and tokens used across the TradingAgents PWA.

---

## 1. Classification of Credentials

| Credential Type | Intended Scope | Exposure Risk | Storage Location | Example Variable |
| :--- | :--- | :--- | :--- | :--- |
| **Public Anon Key** | Client & Edge | Low (protected by RLS) | Frontend `.env`, Cloudflare Worker | `VITE_SUPABASE_ANON_KEY` |
| **Supabase JWT Secret** | Backend Only | Critical (allows forging tokens) | Backend `.env` / Process Env | `SUPABASE_JWT_SECRET` |
| **Supabase Service Role Key** | Backend Only (Optional) | Critical (bypasses RLS) | Secure Server Vault / Process Env | `SUPABASE_SERVICE_ROLE_KEY` |
| **AI Provider Keys** | Backend Only | High (financial cost / quota exhaustion) | Backend `.env` / Windows Credential Manager | `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` |
| **Financial Broker Keys** | Backend Only (Strictly Disabled) | Critical (unauthorized execution) | Offline Vault (Never in repository) | `ALPACA_API_KEY`, `BINANCE_API_KEY` |

---

## 2. Rules of Credential Handling

1. **Zero Client-Side Secret Leakage**:
   - Never inject provider API keys, JWT signing secrets, or database master passwords into frontend bundles or Vite environment variables prefixed with `VITE_`.
   - The Vite build output is audited to verify only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are embedded.
2. **Never Commit Secrets to Version Control**:
   - The root `.gitignore` contains explicit exclusions for:
     ```
     .env
     .env.local
     .env.*.local
     *.pem
     *.key
     *.pfx
     *.secret
     ```
   - Automated git pre-commit hooks and GitHub Actions scan commits for credential patterns using secret scanning actions.
3. **Template Placeholders Only**:
   - All `.env.example` templates contain clearly labeled synthetic placeholders (e.g. `your-supabase-jwt-secret-min-32-chars-long`).

---

## 3. Storage Architecture in Free-First Personal Deployments

### 3.1 Local Windows Development
- Create a `.env` file in `backend/` (or set environment variables in your current PowerShell session):
  ```powershell
  $env:SUPABASE_JWT_SECRET="your-32-character-secret"
  $env:GEMINI_API_KEY="AIzaSy..."
  $env:GROQ_API_KEY="gsk_..."
  ```
- For enhanced security on Windows workstations, credentials can be retrieved from **Windows Credential Manager** via PowerShell:
  ```powershell
  # Store a secret securely
  cmdkey /generic:TradingAgents_Gemini /user:APIKey /pass:"AIzaSy..."

  # Query via Python keyring module if installed
  ```

### 3.2 Cloudflare Pages and Workers
- Public variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) are stored in `cloudflare/wrangler.toml` under `[vars]`.
- Sensitive variables (if edge JWT validation is enabled) are set using Wrangler encrypted secrets:
  ```bash
  npx wrangler secret put SUPABASE_JWT_SECRET
  ```

### 3.3 Supabase Hosted Project
- Database credentials and user auth secrets are generated and rotated within the Supabase Dashboard:
  - Settings -> API -> Project API Keys.
  - Settings -> Database -> Connection Pooling.

---

## 4. Credential Rotation Procedures

### 4.1 AI Provider Key Compromise
1. Log in to the provider console (e.g., Google AI Studio, Groq Cloud, OpenAI Platform).
2. Immediately revoke the compromised API key.
3. Generate a new API key.
4. Update the local `backend/.env` file.
5. Restart the FastAPI backend service (`.\start-dev.ps1` or `python -m uvicorn backend.app.main:app`).

### 4.2 Supabase JWT Secret Rotation
1. Navigate to Supabase Dashboard -> Settings -> API.
2. Generate a new JWT Secret.
3. Note: Rotating this secret invalidates all currently active user sessions.
4. Update `SUPABASE_JWT_SECRET` in `backend/.env` and Cloudflare secrets.
5. Restart the backend service. Users will be redirected to `/auth` to re-authenticate.

---

## 5. Security Checklist Before Pushing Code

- [ ] Run `git diff --staged` and inspect every line for real API keys or tokens.
- [ ] Confirm no `.env` files appear in `git status`.
- [ ] Run `npm run build` in `frontend/` and inspect `frontend/dist/` assets to ensure no backend secrets are bundled.
- [ ] Ensure `ENABLE_LIVE_TRADING=False` remains set in all committed configuration files.
