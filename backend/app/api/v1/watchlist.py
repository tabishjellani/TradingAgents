"""Watchlist Management API endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.auth import UserClaims, get_current_user
from backend.app.db.repository import db_repo
from tradingagents.dataflows.symbols import crypto_base, safe_ticker_component

router = APIRouter(prefix="/api/v1/watchlists", tags=["Watchlists"])


class WatchlistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str
    asset_type: str
    sort_order: int = 0


class WatchlistModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    is_default: bool = False
    items: list[WatchlistItem] = Field(default_factory=list)


# In-memory runtime cache synchronized with db_repo
_watchlists_db: dict[str, WatchlistModel] = {}


def _get_user_watchlists(user_id: str) -> list[WatchlistModel]:
    lists = [w for w in _watchlists_db.values() if w.user_id == user_id]
    if not lists:
        default_wl = WatchlistModel(
            user_id=user_id,
            name="My Primary Watchlist",
            is_default=True,
            items=[
                WatchlistItem(symbol="NVDA", asset_type="stock", sort_order=0),
                WatchlistItem(symbol="AAPL", asset_type="stock", sort_order=1),
                WatchlistItem(symbol="BTC-USD", asset_type="crypto", sort_order=2),
            ],
        )
        _watchlists_db[default_wl.id] = default_wl
        return [default_wl]
    return lists


@router.get("", response_model=list[WatchlistModel])
async def list_watchlists(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> list[WatchlistModel]:
    """List all watchlists belonging to the authenticated user."""
    return _get_user_watchlists(current_user.id)


@router.post("", response_model=WatchlistModel, status_code=status.HTTP_201_CREATED)
async def create_watchlist(
    name: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> WatchlistModel:
    """Create a new custom watchlist."""
    wl = WatchlistModel(user_id=current_user.id, name=name.strip())
    _watchlists_db[wl.id] = wl
    await db_repo.save_watchlist(wl.model_dump())
    return wl


@router.post("/{watchlist_id}/items", response_model=WatchlistModel)
async def add_watchlist_item(
    watchlist_id: str,
    symbol: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> WatchlistModel:
    """Add a validated stock or crypto symbol to a watchlist."""
    wl = _watchlists_db.get(watchlist_id)
    if not wl or wl.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist not found.",
        )

    clean_symbol = safe_ticker_component(symbol.strip().upper())
    is_crypto = crypto_base(clean_symbol) is not None

    if not any(item.symbol == clean_symbol for item in wl.items):
        wl.items.append(
            WatchlistItem(
                symbol=clean_symbol,
                asset_type="crypto" if is_crypto else "stock",
                sort_order=len(wl.items),
            )
        )
    return wl


@router.delete("/{watchlist_id}/items/{symbol}", response_model=WatchlistModel)
async def remove_watchlist_item(
    watchlist_id: str,
    symbol: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> WatchlistModel:
    """Remove a symbol from a watchlist."""
    wl = _watchlists_db.get(watchlist_id)
    if not wl or wl.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist not found.",
        )

    clean_symbol = symbol.strip().upper()
    wl.items = [item for item in wl.items if item.symbol != clean_symbol]
    return wl
