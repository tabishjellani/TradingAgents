# Free-Tier Limits and Zero-Cost Strategy Guide

TradingAgents PWA is architected to operate at **zero ongoing monthly hosting cost** for personal research, educational exploration, and quantitative backtesting. This document details verified free-tier limits, quotas, rate limits, and fallback strategies.

---

## 1. Zero-Cost Architectural Stack

| Layer | Provider | Free-Tier Allowance | Cost When Exceeded | Strategy in TradingAgents |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend & Gateway** | Cloudflare Pages & Workers | Unlimited bandwidth, 100,000 Worker requests/day | Pay-as-you-go ($5/mo for 10M) | Static PWA cached at Cloudflare edge; API proxies pass through Worker |
| **Authentication & DB** | Supabase | 500 MB database, 50,000 monthly active users, 5 GB egress | Pause after 7 days inactivity (free unpause) | 13 normalized tables use < 15 MB storage for normal personal use |
| **Python Compute** | Local Windows PC | Unlimited execution (uses local CPU/RAM/SSD) | Electricity & hardware cost only | FastAPI + TradingAgents engine run locally on port 8000; no cloud compute bills |
| **Tunnel / Ingress** | Cloudflare Tunnel | Unlimited bandwidth, free outbound reverse tunnel | Free | `cloudflared.exe` creates secure zero-trust tunnel to localhost |
| **Market Data** | Yahoo Finance (via `yfinance`) | Public free quote & historical OHLCV data | Throttled if rate exceeded | 60-second in-memory quote caching, 1-hour history caching |
| **LLM Research (AI)** | Google Gemini Free Tier / Groq Free Tier | 15 RPM / 1M TPM (Gemini 1.5 Flash), Groq free preview | Rejection with HTTP 429 (no charge) | Bounded retries, configurable models, graceful failure messaging |

---

## 2. AI Provider Free-Tier Specifics

### 2.1 Google Gemini (Recommended Free-Tier Provider)
- **Eligibility**: Any developer with a standard Google account.
- **Console**: [https://aistudio.google.com](https://aistudio.google.com)
- **Model**: `gemini-1.5-flash` or `gemini-2.0-flash`.
- **Free Quota**: 15 requests per minute (RPM), 1,000,000 tokens per minute (TPM), 1,500 requests per day (RPD).
- **Billing Notice**: Free tier queries may be reviewed by human evaluators per Google terms. Do not send sensitive personal data. If limits are reached, the API returns HTTP 429; no automatic credit card charge occurs unless billing is explicitly enabled.

### 2.2 Groq Cloud (Free Preview Provider)
- **Eligibility**: Developer account on [https://console.groq.com](https://console.groq.com).
- **Models**: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`.
- **Free Quota**: ~30 RPM with ultra-low latency.
- **Behavior on Limit**: Returns 429 rate limit exceeded.

---

## 3. Cost-Safety Controls in Application Code

To ensure an unexpected loop never incurs costs:
1. **No Automatic Paid Fallback**:
   - The application will **never** automatically switch from a free provider to a paid model (e.g. GPT-4o) without explicit user intervention.
2. **Quota Ledger Hard Stop**:
   - `backend/app/api/v1/research.py` checks the user's daily research job count in `usage_ledger`. Standard tier is capped at 5 multi-agent deep research runs per 24 hours.
3. **Graceful Disconnection**:
   - If an API key is missing or quota is exhausted, the UI displays an actionable setup banner guiding the user to configure their free key rather than failing silently.
