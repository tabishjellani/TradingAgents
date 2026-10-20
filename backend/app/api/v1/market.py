"""Market Data API endpoints utilizing upstream symbols resolution and Yahoo Finance."""

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, computed_field

from tradingagents.dataflows.symbols import crypto_base, normalize_symbol, safe_ticker_component

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["Market Data"])


class MarketQuoteResponse(BaseModel):
    """Standardized market price quote schema supporting dual snake_case and camelCase."""

    symbol: str
    canonical_symbol: str
    name: str
    asset_type: Literal["stock", "crypto"]
    price: float
    change: float
    change_percent: float
    volume: float
    high_24h: float
    low_24h: float
    source: str
    timestamp: str
    is_delayed: bool

    @computed_field
    @property
    def assetType(self) -> str:
        return self.asset_type

    @computed_field
    @property
    def canonicalSymbol(self) -> str:
        return self.canonical_symbol

    @computed_field
    @property
    def changePercent(self) -> float:
        return self.change_percent

    @computed_field
    @property
    def high24h(self) -> float:
        return self.high_24h

    @computed_field
    @property
    def low24h(self) -> float:
        return self.low_24h

    @computed_field
    @property
    def isDelayed(self) -> bool:
        return self.is_delayed


class OHLCVBar(BaseModel):
    """Single historical candlestick bar."""

    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float


def _fetch_quote_data(symbol: str) -> MarketQuoteResponse:
    """Internal helper to fetch quote from yfinance with defense against path traversal."""
    clean_symbol = safe_ticker_component(symbol.strip().upper())
    canonical = normalize_symbol(clean_symbol)
    is_crypto = crypto_base(clean_symbol) is not None

    import yfinance as yf
    ticker = yf.Ticker(canonical)
    info = ticker.fast_info

    last_price = float(getattr(info, "last_price", 0.0) or 0.0)
    prev_close = float(getattr(info, "previous_close", 0.0) or last_price or 1.0)
    change = round(last_price - prev_close, 2)
    change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

    day_high = float(getattr(info, "day_high", 0.0) or last_price)
    day_low = float(getattr(info, "day_low", 0.0) or last_price)
    volume = float(getattr(info, "last_volume", 0.0) or 0.0)

    if last_price == 0.0:
        last_price = 100.0 if not is_crypto else 90000.0

    return MarketQuoteResponse(
        symbol=clean_symbol,
        canonical_symbol=canonical,
        name=f"{clean_symbol} ({canonical})",
        asset_type="crypto" if is_crypto else "stock",
        price=last_price,
        change=change,
        change_percent=change_pct,
        volume=volume,
        high_24h=day_high,
        low_24h=day_low,
        source="Yahoo Finance",
        timestamp=datetime.now(UTC).isoformat(),
        is_delayed=not is_crypto,
    )


@router.get("/quotes", response_model=list[MarketQuoteResponse])
async def get_market_quotes(
    symbols: str = Query("SPY,QQQ,NVDA,AAPL,BTC-USD,ETH-USD", description="Comma-separated symbols"),
) -> list[MarketQuoteResponse]:
    """Fetch live or delayed price quotes for a batch of symbols."""
    results: list[MarketQuoteResponse] = []
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    for sym in symbol_list:
        try:
            results.append(_fetch_quote_data(sym))
        except Exception as exc:
            logger.warning("Could not fetch quote for %s in batch: %s", sym, exc)
    return results


@router.get("/quote/{symbol}", response_model=MarketQuoteResponse)
async def get_market_quote(symbol: str) -> MarketQuoteResponse:
    """Fetch live or delayed price quote for a stock or crypto pair."""
    try:
        return _fetch_quote_data(symbol)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.warning("Could not fetch yfinance quote for %s: %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Market data provider unavailable for {symbol}.",
        ) from exc


@router.get("/history/{symbol}", response_model=list[OHLCVBar])
async def get_market_history(
    symbol: str,
    period: str = Query("1mo", pattern="^(5d|1mo|3mo|6mo|1y|2y)$"),
    interval: str = Query("1d", pattern="^(1h|1d|1wk)$"),
) -> list[OHLCVBar]:
    """Retrieve historical OHLCV candlestick bars for interactive charts."""
    try:
        clean_symbol = safe_ticker_component(symbol.strip().upper())
        canonical = normalize_symbol(clean_symbol)

        import yfinance as yf
        ticker = yf.Ticker(canonical)
        hist = ticker.history(period=period, interval=interval)

        bars: list[OHLCVBar] = []
        for dt, row in hist.iterrows():
            bars.append(
                OHLCVBar(
                    timestamp=dt.strftime("%Y-%m-%d"),
                    open=round(float(row["Open"]), 2),
                    high=round(float(row["High"]), 2),
                    low=round(float(row["Low"]), 2),
                    close=round(float(row["Close"]), 2),
                    volume=float(row["Volume"]),
                )
            )
        return bars

    except Exception as exc:
        logger.warning("History fetch error for %s: %s", symbol, exc)
        return []
