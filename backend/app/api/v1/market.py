"""Market Data API endpoints with provider abstraction, caching, and health diagnostics."""

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from backend.app.services.market_data import (
    MarketProviderStatus,
    MarketQuoteResponse,
    OHLCVBar,
    SymbolSearchResult,
    market_service,
)
from tradingagents.dataflows.symbols import safe_ticker_component

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["Market Data"])


@router.get("/status", response_model=MarketProviderStatus)
async def get_market_data_status() -> MarketProviderStatus:
    """Retrieve market data provider connectivity, health, and cache statistics.

    Never exposes secret API credentials or private user configurations.
    """
    return market_service.get_provider_status()


@router.get("/search", response_model=list[SymbolSearchResult])
async def search_market_symbols(
    query: Annotated[str, Query(min_length=1, max_length=32, description="Ticker or asset search query")],
) -> list[SymbolSearchResult]:
    """Search stock and cryptocurrency symbols for research and watchlists."""
    return market_service.search_symbols(query)


@router.get("/quotes", response_model=list[MarketQuoteResponse])
async def get_market_quotes(
    symbols: str = Query("SPY,QQQ,NVDA,AAPL,BTC-USD,ETH-USD", description="Comma-separated symbols"),
) -> list[MarketQuoteResponse]:
    """Fetch live or delayed price quotes for a batch of symbols with TTL caching."""
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    return market_service.fetch_quotes(symbol_list)


@router.get("/quote/{symbol}", response_model=MarketQuoteResponse)
async def get_market_quote(symbol: str) -> MarketQuoteResponse:
    """Fetch live or delayed price quote for a single stock or crypto pair."""
    # 1. Reject invalid or path-traversal symbols with HTTP 400
    try:
        safe_ticker_component(symbol.strip().upper())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # 2. Fetch quote with caching
    try:
        return market_service.fetch_quote(symbol)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.warning("Market quote error for %s: %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Market data provider temporarily unavailable for {symbol}.",
        ) from exc


@router.get("/history/{symbol}", response_model=list[OHLCVBar])
async def get_market_history(
    symbol: str,
    period: str = Query("1mo", pattern="^(5d|1mo|3mo|6mo|1y|2y)$"),
    interval: str = Query("1d", pattern="^(1h|1d|1wk)$"),
) -> list[OHLCVBar]:
    """Retrieve historical OHLCV candlestick bars for interactive charts."""
    try:
        safe_ticker_component(symbol.strip().upper())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        return market_service.fetch_history(symbol=symbol, period=period, interval=interval)
    except Exception as exc:
        logger.warning("History fetch error for %s: %s", symbol, exc)
        return []
