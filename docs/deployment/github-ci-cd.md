# GitHub CI/CD Pipeline Guide

This document describes the automated testing, linting, security scanning, and deployment workflows implemented for TradingAgents PWA using GitHub Actions.

---

## 1. CI Workflow Overview (`.github/workflows/ci.yml`)

The CI workflow runs on every pull request and push to `main` and `pwa-fullstack` branches. It consists of three decoupled jobs:

1. **`python-tests`**:
   - Sets up Python 3.10 and 3.12 runners.
   - Installs dependencies from `pyproject.toml` and `requirements.txt`.
   - Runs Ruff linter (`ruff check .`).
   - Executes the 27 unit and integration tests across FastAPI, auth, research engine adapter, paper trading ledger, alerts, and live trading safety.
2. **`frontend-pwa-build`**:
   - Sets up Node.js 20.
   - Installs npm packages cleanly (`npm ci`).
   - Runs TypeScript type checking (`tsc -b`).
   - Executes Vite production build (`npm run build`).
   - Verifies that `dist/index.html`, `dist/sw.js`, and `dist/manifest.webmanifest` exist.
3. **`security-scan`**:
   - Audits npm dependencies for known CVEs (`npm audit --audit-level=high`).
   - Checks that `ENABLE_LIVE_TRADING` is not accidentally set to `True` in committed code.

---

## 2. GitHub Secrets Configuration

If automated deployment to Cloudflare Pages is configured via GitHub Actions, store the following repository secrets under **Settings -> Secrets and variables -> Actions**:

| Secret Name | Description | Source |
| :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | API Token with Cloudflare Pages Edit permissions | Cloudflare Dashboard -> My Profile -> API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | 32-character Cloudflare Account ID | Cloudflare Dashboard URL or Overview page |
| `SUPABASE_JWT_SECRET` | Synthetic secret for CI test runs | Generated randomly or copied from Supabase |

---

## 3. Local Pre-Push Checklist

Before pushing to your branch or opening a pull request, run these commands locally on Windows:

```powershell
# 1. Run full backend tests
.\.venv\Scripts\pytest.exe backend/tests/ -v

# 2. Run frontend type checking & build
cd frontend
npm run build
cd ..

# 3. Check git status to ensure no secrets or untracked .env files exist
git status
```
