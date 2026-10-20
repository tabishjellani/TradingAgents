# Upstream Attribution and Third-Party Licensing

This project is an extension of the open-source **TradingAgents** framework created by Tauric Research, transformed into a multi-user Progressive Web App (PWA).

---

## 1. Upstream Project Identification

- **Original Project Name**: TradingAgents
- **Original Authors & Copyright**: Copyright (c) Tauric Research and contributors.
- **Upstream Repository**: [https://github.com/TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- **Original License**: Apache License, Version 2.0
- **Upstream Checked-Out Version**: v0.7.0

---

## 2. Compliance with Apache License, Version 2.0

In accordance with Section 4 of the Apache-2.0 License:

1. **Retention of Notices**: All original copyright, patent, trademark, and attribution notices from the upstream source files have been strictly preserved.
2. **Prominent Notice of Modifications**:
   - The upstream multi-agent graph architecture (`tradingagents/graph/trading_graph.py`), analyst debate protocol, and baseline algorithms remain intact.
   - An additive adapter layer (`backend/app/engine/adapter.py`) was introduced to bridge the synchronous LangGraph propagation loop into FastAPI's asynchronous job lifecycle.
   - The following additive modules were created:
     - `frontend/`: Progressive Web Application (React 19, TypeScript, Vite, Tailwind-free vanilla CSS design system).
     - `backend/`: FastAPI REST API, Supabase JWT verification, quantitative paper trading ledger with `Decimal` precision, server-side alert evaluator, and live trading safety manager.
     - `supabase/migrations/`: SQL database schema with Row Level Security (RLS) on all 13 tables.
     - `cloudflare/`: Edge Worker gateway for static asset serving and rate limiting.
3. **No Endorsement**: The name "TradingAgents" and "Tauric Research" are used for attribution purposes only and do not imply endorsement or warranty of this Progressive Web App derivative.

---

## 3. Third-Party Licenses

This project incorporates dependencies distributed under permissive open-source licenses:

| Library | Role | License |
| :--- | :--- | :--- |
| **FastAPI** | Backend Web Framework | MIT |
| **Pydantic** | Data Validation | MIT |
| **React** | Frontend UI Library | MIT |
| **Lucide React** | Icons | ISC |
| **yfinance** | Market Data Retrieval | Apache-2.0 |
| **Supabase Client** | Auth & Database Client | MIT |
| **Uvicorn** | ASGI Web Server | BSD-3-Clause |
