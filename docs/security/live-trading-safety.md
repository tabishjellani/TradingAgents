# Live Trading Safety Architecture & Controls

This document details the multi-layered safety controls, fail-closed architecture, risk parameters, and operational protocols governing the optional live-trading integration in TradingAgents PWA.

---

## 1. Safety Philosophy & Guiding Principles

1. **Safety Over Execution**:
   - The primary purpose of TradingAgents is deep multi-agent quantitative and qualitative research. Live execution is an optional, high-risk capability that must remain **hard-disabled by default**.
2. **Fail-Closed Design**:
   - If market data is stale, the risk manager is unreachable, the kill switch is triggered, or network latency is excessive, the system aborts execution immediately.
3. **Strict Separation of Environments**:
   - Live trading is completely separated from Research Mode and Paper Trading Mode. Paper portfolios and live brokerage accounts never share state, order queues, or database tables.
4. **No Financial Advisory**:
   - TradingAgents makes no guarantees of profitability. Backtest results, multi-agent debates, and paper-trading returns represent historical or synthetic models, not financial advice.

---

## 2. Multi-Stage Order Lifecycle

Any potential live order must traverse five mandatory validation gates before broker transmission:

```
[ Step 1: User Intent / Recommendation ]
       │
       ▼
[ Gate 1: System-Level Enablement Check ]
       ├── Backend Config: ENABLE_LIVE_TRADING == True
       └── Admin Authorization: User has "operator" or "admin" role
       │
       ▼
[ Gate 2: Pre-Flight Risk & Guardrail Engine ]
       ├── Kill switch check (fails if KILL_SWITCH_ACTIVE == True)
       ├── Symbol Allowlist verification (e.g. AAPL, NVDA, SPY only)
       ├── Maximum Notional Cap check (e.g. $1,000.00 maximum order size)
       ├── Maximum Open Positions check (e.g. max 5 concurrent open positions)
       └── Market Data Freshness check (< 60 seconds old)
       │
       ▼
[ Gate 3: Idempotency & Duplicate Prevention ]
       ├── Cryptographic hash of (user_id, symbol, side, quantity, timestamp_bucket)
       └── Rejection if duplicate key exists within 60-second window
       │
       ▼
[ Gate 4: Two-Step Interactive User Confirmation ]
       ├── Server generates an Order Preview containing:
       │     - Exact side, quantity, limit/market price
       │     - Estimated notional value and estimated exchange fees
       │     - Applicable risk limits remaining
       └── Explicit user confirmation signature received
       │
       ▼
[ Gate 5: Pre-Transmission Broker Check ]
       ├── Final balance and margin check with broker API
       └── Execution transmission via provider adapter
```

---

## 3. Emergency Kill Switch (`live_safety.py`)

The system includes a singleton `LiveTradingSafetyManager` (`backend/app/engine/live_safety.py`) providing an instantaneous hardware/software kill switch:

### Activating the Kill Switch:
- Via Admin UI: Navigate to `/admin` -> "Emergency Kill Switch" -> Click "Activate Kill Switch".
- Via REST API:
  ```http
  POST /api/v1/trading/kill-switch
  Authorization: Bearer <ADMIN_OR_OPERATOR_JWT>
  Content-Type: application/json

  {
    "action": "activate",
    "reason": "Market volatility spike / Operator manual override"
  }
  ```

### Kill Switch Effects:
1. Sets `KILL_SWITCH_ACTIVE = True` in memory and broadcasts state via WebSockets.
2. Immediately rejects all incoming order previews and submissions with `HTTP 403 Forbidden` (`detail: "Emergency kill switch is active"`).
3. Invokes broker cancel-all API to cancel all pending/unfilled working orders on the exchange.
4. Records an urgent audit log event in `audit_events`.

---

## 4. Default Configuration & Risk Boundaries

In `backend/app/config.py` and `backend/app/engine/live_safety.py`, the default parameters are strictly locked:

```python
ENABLE_LIVE_TRADING: bool = False               # Hard-disabled in codebase
MAX_NOTIONAL_PER_ORDER: Decimal = Decimal("1000.00") # $1,000 max single order
MAX_OPEN_POSITIONS: int = 5                     # Max 5 open positions
ALLOWED_SYMBOLS: set = {"AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "SPY", "QQQ"}
```

---

## 5. Procedure for Enabling Live Trading (Sandbox Only)

Before enabling live execution, operators must complete this verification checklist:

1. [ ] Verify paper-trading portfolio accounting over at least 30 historical simulations.
2. [ ] Connect exclusively to a **Paper/Sandbox broker endpoint** (e.g., Alpaca Paper API or Binance Testnet).
3. [ ] Set `ENABLE_LIVE_TRADING=True` in `backend/.env`.
4. [ ] Ensure the admin account has verified email and multi-factor authentication enabled.
5. [ ] Execute a $1.00 test order on sandbox to confirm round-trip fill reconciliation.
6. [ ] Confirm that activating the Kill Switch successfully cancels the working test order.
