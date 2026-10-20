"""TradingAgents Engine Adapter.

Provides a thread-safe interface to the upstream TradingAgentsGraph.
"""

from __future__ import annotations

import logging
from typing import Any

from tradingagents.agents.rating import is_review, run_rating
from tradingagents.dataflows.symbols import safe_ticker_component
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

logger = logging.getLogger(__name__)


class EngineExecutionError(Exception):
    """Raised when TradingAgents graph execution encounters an unrecoverable failure."""


def execute_research_run(
    symbol: str,
    trade_date: str,
    asset_type: str = "stock",
    selected_analysts: list[str] | None = None,
    config_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a genuine research run through the upstream TradingAgentsGraph.

    Validates inputs to prevent directory traversal and lookahead dates.
    Returns structured results containing all agent reports and consensus rating.
    """
    # 1. Validate symbol safe path component (defense-in-depth against path traversal)
    clean_symbol = safe_ticker_component(symbol.strip().upper())

    # 2. Assemble run configuration from defaults
    run_config = DEFAULT_CONFIG.copy()
    if config_overrides:
        run_config.update(config_overrides)

    analysts = tuple(selected_analysts) if selected_analysts else (
        "market", "news", "fundamentals"
    ) if asset_type == "stock" else ("market", "news")

    try:
        # 3. Instantiate upstream graph
        graph = TradingAgentsGraph(
            selected_analysts=analysts,
            debug=False,
            config=run_config,
        )

        # 4. Propagate graph synchronously in worker thread
        final_state, signal = graph.propagate(
            company_name=clean_symbol,
            trade_date=trade_date,
            asset_type=asset_type,
        )

        rating_value = run_rating(final_state) if not is_review(signal) else "REVIEW"

        # 5. Extract structured results
        inv_debate = final_state.get("investment_debate_state") or {}
        risk_debate = final_state.get("risk_debate_state") or {}

        return {
            "symbol": clean_symbol,
            "trade_date": trade_date,
            "asset_type": asset_type,
            "signal": signal,
            "rating": rating_value,
            "reports": {
                "market": final_state.get("market_report", ""),
                "sentiment": final_state.get("sentiment_report", ""),
                "news": final_state.get("news_report", ""),
                "fundamentals": final_state.get("fundamentals_report", ""),
            },
            "debates": {
                "bull_history": inv_debate.get("bull_history", ""),
                "bear_history": inv_debate.get("bear_history", ""),
                "investment_plan": final_state.get("investment_plan", ""),
                "trader_plan": final_state.get("trader_investment_plan", ""),
                "risk_history": risk_debate.get("history", ""),
                "final_decision": final_state.get("final_trade_decision", ""),
            },
            "memory_note": final_state.get("memory_note", ""),
        }

    except Exception as exc:
        logger.exception("Failed executing TradingAgentsGraph for %s on %s", clean_symbol, trade_date)
        raise EngineExecutionError(f"Multi-agent execution error for {clean_symbol}: {exc}") from exc
