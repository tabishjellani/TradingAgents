# Cloudflare Deployment Guide: Pages, Workers & Tunnels

This guide explains how to deploy the TradingAgents PWA to Cloudflare's free tier, using **Cloudflare Pages** for static PWA hosting and **Cloudflare Workers / Tunnels** for API routing to your local Windows research engine without purchasing a domain.

---

## 1. Architecture Overview

```
[ User Browser / Installed PWA ]
              │
              ▼
[ Cloudflare Pages / Workers Gateway ]
  - Hosts static React 19 PWA build (`frontend/dist/`)
  - Free `*.pages.dev` or `*.workers.dev` subdomain
  - Edge rate limiting (60 req/min) & security headers
  - Proxies `/api/*` to the Python backend
              │
              ▼ (Cloudflare Tunnel: Encrypted zero-trust outbound connection)
[ Local Windows Workstation ]
  - Cloudflared daemon (`cloudflared.exe`)
  - FastAPI Python backend (`http://127.0.0.1:8000`)
```

---

## 2. Deploying the Frontend with Cloudflare Pages

### Option A: Direct Git Integration (Recommended)
1. Push your repository to GitHub.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select your repository (`TradingAgents-main`).
4. Configure Build Settings:
   - **Framework preset**: `Vite`
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Environment Variables:
   - `VITE_SUPABASE_URL`: `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `your-anon-key`
   - `VITE_API_URL`: `/api/v1` (routes via Worker or reverse proxy)
6. Click **Save and Deploy**. Cloudflare provisions your free URL at `https://tradingagents-pwa.pages.dev`.

### Option B: Deploying via Wrangler CLI
From your local Windows machine:

```powershell
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=tradingagents-pwa
```

---

## 3. Connecting the Python Backend via Cloudflare Tunnel (Zero Cost)

Because the Python multi-agent framework runs on your local Windows PC, you do not need a paid public cloud server or public IP address. Cloudflare Tunnel provides an encrypted outbound bridge to your local FastAPI service:

### Step 1: Install Cloudflared on Windows
Download `cloudflared-windows-amd64.exe` from Cloudflare's official GitHub releases or install via winget:
```powershell
winget install Cloudflare.cloudflared
```

### Step 2: Create a Free Quick Tunnel
For instant development testing:
```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```
Cloudflared outputs an ephemeral public URL (e.g., `https://random-word-abc.trycloudflare.com`). Set this URL as `PYTHON_BACKEND_URL` in your Cloudflare Worker.

### Step 3: Or Configure a Permanent Named Tunnel (Free Tier)
1. In Cloudflare Dashboard -> **Zero Trust** -> **Networks** -> **Tunnels**.
2. Click **Add a Tunnel** -> Name it `tradingagents-local`.
3. Follow the Windows PowerShell instructions to install the tunnel as a background service:
   ```powershell
   cloudflared.exe service install <TOKEN>
   ```
4. Map the public hostname to `http://localhost:8000`.

---

## 4. Deploying the Cloudflare Worker Gateway

The edge gateway code is located in `cloudflare/`:

1. Inspect `cloudflare/wrangler.toml` and `cloudflare/src/index.ts`.
2. Deploy the Worker:
   ```powershell
   cd cloudflare
   npx wrangler deploy
   ```
3. Test edge health check:
   ```powershell
   curl https://tradingagents-pwa.<your-subdomain>.workers.dev/edge-health
   ```
