"""Paper Portfolio & Order Ledger API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.auth import UserClaims, get_current_user
from backend.app.engine.paper_trading import (
    PaperOrderRecord,
    PaperOrderRequest,
    PaperTradingEngine,
    PortfolioState,
)
from tradingagents.dataflows.symbols import crypto_base, normalize_symbol, safe_ticker_component

router = APIRouter(prefix="/api/v1/portfolios", tags=["Portfolios"])

# In-memory store for paper portfolios (synced to Supabase when configured)
_portfolios_db: dict[str, PortfolioState] = {}


def _get_or_create_portfolio(user_id: str) -> PortfolioState:
    for p in _portfolios_db.values():
        if p.user_id == user_id:
            return p

    new_p = PortfolioState(
        user_id=user_id,
        name="Primary Paper Portfolio",
        initial_cash=100000.00,
        current_cash=100000.00,
    )
    _portfolios_db[new_p.id] = new_p
    return new_p


@router.get("", response_model=list[PortfolioState])
async def list_user_portfolios(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> list[PortfolioState]:
    """Retrieve all paper trading portfolios belonging to the authenticated user."""
    return [_get_or_create_portfolio(current_user.id)]


@router.get("/{portfolio_id}", response_model=PortfolioState)
async def get_portfolio(
    portfolio_id: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> PortfolioState:
    """Get specific paper portfolio details, holdings, and cash."""
    p = _portfolios_db.get(portfolio_id)
    if not p or p.user_id != current_user.id:
        p = _get_or_create_portfolio(current_user.id)
    return p


@router.post("/{portfolio_id}/orders", response_model=PaperOrderRecord)
async def submit_paper_order(
    portfolio_id: str,
    order_req: PaperOrderRequest,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> PaperOrderRecord:
    """Execute a simulated paper order against live or delayed market prices."""
    p = _portfolios_db.get(portfolio_id)
    if not p or p.user_id != current_user.id:
        p = _get_or_create_portfolio(current_user.id)

    clean_symbol = safe_ticker_component(order_req.symbol.strip().upper())
    canonical = normalize_symbol(clean_symbol)
    is_crypto = crypto_base(clean_symbol) is not None

    # Fetch fresh market price (or fallback default)
    price = 100.0 if not is_crypto else 94000.0
    try:
        import yfinance as yf
        ticker = yf.Ticker(canonical)
        last_price = getattr(ticker.fast_info, "last_price", 0.0)
        if last_price and last_price > 0:
            price = float(last_price)
    except Exception:
        pass

    # Execute order via quantitative paper engine
    fill = PaperTradingEngine.execute_order(
        portfolio=p,
        order_req=order_req,
        current_market_price=price,
        asset_type="crypto" if is_crypto else "stock",
    )

    if fill.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=fill.rejection_reason or "Order rejected.",
        )

    return fill


@router.get("/{portfolio_id}/orders", response_model=list[PaperOrderRecord])
async def list_portfolio_orders(
    portfolio_id: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> list[PaperOrderRecord]:
    """Retrieve full trade ledger history for this portfolio."""
    p = _portfolios_db.get(portfolio_id)
    if not p or p.user_id != current_user.id:
        p = _get_or_create_portfolio(current_user.id)
    return p.orders
