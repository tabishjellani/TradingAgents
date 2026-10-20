# Operational Troubleshooting Guide

This guide provides fast diagnosis and resolution steps for common runtime errors encountered across Windows, FastAPI, Supabase, and Cloudflare environments.

---

## 1. Backend / FastAPI Issues

### Problem: `ModuleNotFoundError: No module named 'tradingagents'`
- **Cause**: Virtual environment is not activated, or the package was not installed in editable mode.
- **Resolution**:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  pip install -e .
  ```

### Problem: `HTTP 401 Unauthorized: Could not validate credentials`
- **Cause**: The `SUPABASE_JWT_SECRET` in `backend/.env` does not match the JWT Secret configured in the Supabase Dashboard.
- **Resolution**:
  1. Go to Supabase Dashboard -> **Project Settings -> API**.
  2. Copy the **JWT Secret**.
  3. Ensure `SUPABASE_JWT_SECRET` in `backend/.env` matches this string exactly without surrounding quotes or spaces.
  4. Restart the FastAPI service.

### Problem: `Port 8000 is already in use`
- **Cause**: A previous Uvicorn process is still running in the background.
- **Resolution**:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```

---

## 2. Market Data & Research Engine Issues

### Problem: `HTTP 429: Rate limit reached for Google Gemini or Yahoo Finance`
- **Cause**: You have submitted too many requests in a single minute on the free tier.
- **Resolution**:
  - The UI will display a warning banner.
  - Wait 60 seconds for the free quota bucket to refill.
  - Switch to an alternative free provider (e.g., Groq) in the Research workspace dropdown.

### Problem: Analysis Job Stays in `queued` or `running` Indefinitely
- **Cause**: If the machine enters sleep mode or internet connectivity drops while an LLM call is awaiting response.
- **Resolution**:
  - Click the **Cancel Job** button on the Research page.
  - Check the backend terminal logs to observe where the timeout occurred.
  - Prevent Windows from entering sleep mode during lengthy multi-agent debate sweeps:
    ```powershell
    powercfg /change standby-timeout-ac 0
    ```

---

## 3. Frontend & PWA Issues

### Problem: PWA "Install App" Prompt Does Not Appear in Chrome / Edge
- **Cause**: PWAs require HTTPS (or `localhost`) and a valid Web App Manifest and Service Worker.
- **Resolution**:
  1. Open Chrome DevTools (`F12`) -> **Application** tab.
  2. Under **Manifest**, verify there are no parsing errors and that icons (`/pwa-192x192.png`) are resolved.
  3. Under **Service Workers**, confirm `sw.js` is active and running.
  4. Note: Desktop Chrome displays an install icon directly in the right side of the address bar.

### Problem: Browser Shows Stale Data While Offline
- **Cause**: Service worker cache is serving cached responses.
- **Resolution**:
  - Offline mode is intentionally designed to serve cached research reports.
  - The top banner displays "Offline Mode - Showing Cached Data".
  - To force refresh when reconnected, press `Ctrl + Shift + R` or click "Sync Now" in the header.
