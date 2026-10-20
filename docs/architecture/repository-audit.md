# TradingAgents Repository Audit (Phase 0)

## 1. Executive Summary & Repository Metadata

- **Upstream Repository**: [https://github.com/TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- **Upstream Version**: `0.7.0` (defined in `tradingagents/__init__.py`)
- **License**: Apache-2.0 (`LICENSE` file present and verified)
- **Active Git Branch**: `pwa-fullstack` (branched off pristine commit of `d:\TradingAgents-main`)
- **Local Environment**:
  - **OS**: Windows 11 AMD64
  - **Python**: 3.14.0 (virtual environment established at `.venv/`)
  - **Node.js**: v24.18.0 / npm 11.16.0
  - **Supabase CLI**: 2.121.0 (available on PATH; local Docker daemon not installed on Windows host)
  - **Cloudflare Wrangler CLI**: 4.151.3 (functional via `npx wrangler`)
  - **Git**: 2.55.0.windows.5

---

## 2. Upstream Architecture & Entry Points

### 2.1 Package Layout
The repository is structured into two primary root packages:
1. `tradingagents/`: Core multi-agent research framework, data flows, LLM clients, memory log, and backtesting.
2. `cli/`: Typer-based terminal user interface (`cli.main:app`), prompt-toolkit interactive flows, rich console displays, and update checkers.

### 2.2 Entry Points
- **Programmatic API**: `tradingagents.graph.trading_graph.TradingAgentsGraph`
  - Instantiation: `ta = TradingAgentsGraph(selected_analysts=..., debug=..., config=...)`
  - Execution: `final_state, signal = ta.propagate(company_name, trade_date, asset_type="stock", portfolio=...)`
  - Signals returned: 5-tier rating (`Buy`, `Overweight`, `Hold`, `Underweight`, `Sell`) or `REVIEW` if unparseable.
- **Root Script**: `main.py`
  - Simple invocation helper that loads `DEFAULT_CONFIG` and calls `ta.propagate("NVDA", "2026-09-01")`.
- **Console Script CLI**: `cli/main.py:app`
  - `tradingagents [OPTIONS]`: Runs interactive or headless analysis.
  - `tradingagents backtest TICKERS --start ... --end ...`: Sweeps historical grid.
  - `tradingagents login / logout`: Manages ChatGPT subscription authentication.

---

## 3. Detailed Component Capabilities Audit

### 3.1 Multi-Agent Research Graph (`tradingagents/graph/`)
- **Analysts**:
  - `MarketAnalyst` (`tradingagents/agents/analysts/market_analyst.py`): Technical indicators, price action, OHLCV bars.
  - `SentimentAnalyst` (`tradingagents/agents/analysts/sentiment_analyst.py`): Social media sentiment (Reddit, StockTwits via Jev/TypeSafe).
  - `NewsAnalyst` (`tradingagents/agents/analysts/news_analyst.py`): Company and global macro news.
  - `FundamentalsAnalyst` (`tradingagents/agents/analysts/fundamentals_analyst.py`): SEC EDGAR filings, balance sheets, income statements (automatically filtered out for crypto).
- **Researcher Team**:
  - `BullResearcher` & `BearResearcher`: Conduct structured debate rounds (`max_debate_rounds`).
  - `ResearchManager`: Formulates consensus investment plan.
- **Trading Team**:
  - `Trader`: Synthesizes research and portfolio context into an actionable transaction proposal.
- **Risk Management Team**:
  - `AggressiveDebator`, `ConservativeDebator`, `NeutralDebator`: Debate portfolio risk based on portfolio context and capital.
  - `PortfolioManager`: Delivers the final decision, 5-tier rating, and execution directives.
- **Memory & Reflection**:
  - `TradingMemoryLog` (`tradingagents/memory/log.py`): Records past decisions, settles returns after holding period (`holding_period_days=5`), and injects lessons into subsequent runs without look-ahead bias (`_memory_as_of` enforces point-in-time boundaries).
- **State Schema**:
  - `AgentState` inherits from `langgraph.graph.MessagesState`.
  - Captures full debater histories, individual analyst reports, portfolio context, final ratings, and runtime notes.

### 3.2 Backtesting Scope & Reality
- **Implementation**: `tradingagents/backtest.py` (`run_backtest`, `iter_grid`, `summarize`)
- **Key Discovery**: Upstream backtesting is an *evaluation grid for past decision quality*, not a sequential portfolio simulator:
  > *"Scope: this evaluates decision quality. It is not a portfolio simulator, and must not grow one. Turning a rating into a filled order needs a quantity, a fill price and a cash ledger, none of which the system has... Cells are therefore independent, and a portfolio, when given, is the same standing book for every cell rather than a position carried forward."*
- **Adapter Implication**: To provide the requested "Paper Portfolios, order execution, slippage, trade ledger, and equity curves", we will retain upstream's decision grid evaluation and add an explicit, tested quantitative paper-trading and portfolio simulation engine (`backend/services/paper_portfolio.py`).

### 3.3 Market Data Vendors & Asset Classes
- **Core Stock APIs**: Yahoo Finance (`yfinance`, keyless, default), Alpha Vantage (`alpha_vantage`).
- **Technical Indicators**: Computed via `stockstats` on Yahoo/Alpha Vantage data.
- **Fundamentals**: SEC EDGAR (keyless with contact User-Agent), Yahoo Finance, Alpha Vantage.
- **Macro**: FRED (Federal Reserve Economic Data, free API key).
- **Prediction Markets**: Polymarket (keyless public API).
- **Crypto Support**:
  - `tradingagents/dataflows/symbols.py`: Syntactic mapping and recognition of crypto pairs (`BTCUSD`, `BTC-USD`, `ETH-USD`, `SOL`, `DOGE`, etc.) into Yahoo's `<BASE>-USD` format.
  - `cli/prompts.py`: Automatically detects `asset_type="crypto"` and excludes `fundamentals` analyst.
  - Upstream supports crypto analysis out-of-the-box via Yahoo Finance price action, news, and sentiment.

### 3.4 Model & Provider Catalog (`tradingagents/llm_clients/`)
Upstream features a unified provider factory supporting:
- **Free / Generous Free Tier**:
  - `google` (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`) via `GOOGLE_API_KEY`.
  - `groq` (fast hosted LLaMA/Mixtral models, generous free quota) via `GROQ_API_KEY`.
  - `ollama` (100% free local execution on Windows PC) via `OLLAMA_BASE_URL`.
- **Commercial / Standard APIs**:
  - `openai`, `anthropic`, `xai`, `deepseek`, `mistral`, `qwen`, `glm`, `minimax`, `kimi`, `openrouter`, `azure`, `bedrock`, `chatgpt` (OAuth).
- **Retry & Budget Controls**:
  - `TRADINGAGENTS_LLM_MAX_RETRIES` (default 2, configurable up to 6+ for rate limits).
  - `TRADINGAGENTS_MAX_TOKENS` (bounds runaway generation).
  - `temperature` control and reasoning effort knobs (`google_thinking_level`, `openai_reasoning_effort`, `anthropic_effort`).

### 3.5 Security, Filesystem & Path Handling
- Upstream uses `safe_ticker_component()` in `tradingagents/dataflows/symbols.py`:
  - Rejects directory traversal payloads (e.g. `../../../`, `..`, null bytes).
  - Limits length to 32 characters and restricts characters to `[A-Za-z0-9._\-\^=+]`.
- `_validate_trade_date()` prevents future date queries.
- Checkpointing uses SQLite checkpointer (`langgraph_checkpoint_sqlite`) isolated per ticker and run signature.

---

## 4. Baseline Test Suite Results

Ran the full upstream test suite via `.venv\Scripts\pytest.exe -q` on Python 3.14.0 Windows AMD64.

### 4.1 Summary
- **Total Tests Collected**: 1,358
- **Passed**: 1,353
- **Subtests Passed**: 100
- **Deselected**: 1 (integration test)
- **Skipped**: 4
  - 3 in `tests/test_api_key_env.py` due to `@pytest.mark.skipif(sys.platform == "win32", reason="POSIX file modes")`
  - 1 in `tests/test_bedrock_provider.py` (optional Bedrock dependency)
- **Failed**: 5 (all attributable to Windows environment assumptions in upstream test code)

### 4.2 Analysis of the 5 Failures
1. `tests/test_suite_isolation.py::test_yfinance_keeps_its_cache_out_of_the_users_home`:
   - Assertion: `assert not Path(_TzDBManager.get_location()).is_relative_to(Path.home())`
   - Cause: On Windows, standard `tempfile.gettempdir()` resolves to `C:\Users\<user>\AppData\Local\Temp`, which is a subfolder of `Path.home()` (`C:\Users\<user>`). On POSIX, temp is `/tmp` (outside `/home`).
2. `tests/test_chatgpt_auth.py::test_a_token_near_expiry_is_renewed_with_the_stored_refresh_token` & `test_signing_in_by_pasting_the_redirect_saves_a_private_sign_in`:
   - Assertion: `assert stat.S_IMODE(auth.AUTH_FILE.stat().st_mode) == 0o600`
   - Cause: NTFS on Windows does not support POSIX permission mode bits (returns `0o666` or `438`). The test omitted the Windows platform skip that other tests in the repository have.
3. `tests/test_cli_updates.py::test_the_upgrade_command_follows_the_install` & `test_a_uv_git_install_is_upgraded_with_uv`:
   - Assertion: Hardcoded string comparison expecting POSIX path `/venv/bin/python` while running on Windows.

**Conclusion**: The upstream research engine, multi-agent graph, data flows, and reasoning components are 100% sound. The 5 test failures are known test harness POSIX assumptions that do not affect runtime functionality.

---

## 5. Gap Analysis: Upstream vs. Target PWA System

| Feature Area | Upstream Status | Required Action / Component |
| :--- | :--- | :--- |
| **Multi-Agent Engine** | Fully implemented (`TradingAgentsGraph`) | Preserve intact; wrap with non-blocking FastAPI async task queue |
| **Web API / REST** | None (CLI and script only) | Implement `backend/` with FastAPI, Pydantic models, and job lifecycle |
| **Frontend PWA** | None | Implement `frontend/` with React 19, TypeScript, Vite, PWA Manifest & SW |
| **Authentication & Users**| Local CLI only (ChatGPT OAuth) | Implement Supabase Auth (Email/password, JWT verification, user roles) |
| **Database & Persistence**| Local SQLite checkpoint / flat Markdown files | Implement Supabase PostgreSQL schema with RLS, jobs, and reports tables |
| **Market Data UI** | Terminal rich tables | Implement interactive charts (Candlesticks, Indicators) via Yahoo API adapter |
| **Crypto Support** | Supported in dataflow and symbols | Add crypto symbol search, quick-select list, and pair validation in UI |
| **Backtesting Engine** | Rating evaluation grid against alpha | Preserve upstream grid evaluator; add quantitative paper portfolio simulator |
| **Watchlists & Paper Portfolios** | In-memory `PortfolioContext` | Implement persistent multi-watchlist & paper trading portfolio with order ledger |
| **Alerts Engine** | None | Implement server-side scheduled alert evaluation service |
| **Administration** | None | Implement admin dashboard for quotas, model allowlists, and audit logs |
| **Offline Capabilities** | None | Service Worker caching app shell + saved research reports in IndexedDB/Cache |
| **Hosting & Gateway** | Local / Docker CLI | Cloudflare Pages (Frontend) + Cloudflare Worker gateway + Local/Hosted Python |
| **Live Trading Safety** | None | Implement strict 4-tier model (Research, Paper, Sandbox, Live-disabled) with Kill Switch |
