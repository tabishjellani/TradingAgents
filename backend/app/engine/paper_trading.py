"""Quantitative Paper Trading Engine.

Uses Decimal arithmetic for precise monetary ledger calculations, fee accounting,
and position reconciliation without floating-point inaccuracies.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, Field


def _d(val: float | str | int | Decimal) -> Decimal:
    """Coerce number to 4-decimal-place Decimal."""
    return Decimal(str(val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


class PaperOrderRequest(BaseModel):
    """Simulated paper order parameters."""

    symbol: str
    side: Literal["buy", "sell"]
    order_type: Literal["market", "limit"] = "market"
    quantity: float = Field(gt=0)
    limit_price: float | None = None
    slippage_bps: int = 5  # 5 basis points (0.05%) default slippage
    fee_bps: int = 0  # 0 basis points default (free commission)


class PaperOrderRecord(BaseModel):
    """Executed paper order fill record."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    portfolio_id: str
    symbol: str
    side: Literal["buy", "sell"]
    order_type: Literal["market", "limit"]
    quantity: float
    price: float
    fees: float
    total_cost: float
    status: Literal["filled", "rejected"]
    executed_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    rejection_reason: str | None = None


class PositionState(BaseModel):
    """Reconciled holding position in an instrument."""

    symbol: str
    asset_type: Literal["stock", "crypto"]
    quantity: float
    average_entry_price: float
    current_price: float
    unrealized_pnl: float
    unrealized_pnl_percent: float


class PortfolioState(BaseModel):
    """Complete portfolio balance, holdings, and P&L ledger."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    currency: str = "USD"
    initial_cash: float = 100000.00
    current_cash: float = 100000.00
    realized_pnl: float = 0.00
    positions: dict[str, PositionState] = Field(default_factory=dict)
    orders: list[PaperOrderRecord] = Field(default_factory=list)


class PaperTradingEngine:
    """Executes paper orders and reconciles cash ledger and positions."""

    @staticmethod
    def execute_order(
        portfolio: PortfolioState,
        order_req: PaperOrderRequest,
        current_market_price: float,
        asset_type: Literal["stock", "crypto"] = "stock",
    ) -> PaperOrderRecord:
        """Execute a simulated order against the portfolio using Decimal arithmetic."""
        sym = order_req.symbol.strip().upper()
        raw_price = _d(current_market_price)
        qty = _d(order_req.quantity)
        cash = _d(portfolio.current_cash)

        # Apply slippage modeling for market orders
        slippage_mult = _d(1) + (_d(order_req.slippage_bps) / _d(10000)) if order_req.side == "buy" else _d(1) - (_d(order_req.slippage_bps) / _d(10000))
        exec_price = (raw_price * slippage_mult).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

        # Calculate fees
        fee = ((exec_price * qty) * (_d(order_req.fee_bps) / _d(10000))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        total_cost = (exec_price * qty) + fee if order_req.side == "buy" else (exec_price * qty) - fee

        # 1. Buy validation: ensure sufficient free paper cash
        if order_req.side == "buy":
            if total_cost > cash:
                record = PaperOrderRecord(
                    portfolio_id=portfolio.id,
                    symbol=sym,
                    side="buy",
                    order_type=order_req.order_type,
                    quantity=float(qty),
                    price=float(exec_price),
                    fees=float(fee),
                    total_cost=float(total_cost),
                    status="rejected",
                    rejection_reason=f"Insufficient paper cash: required ${float(total_cost):.2f}, available ${float(cash):.2f}.",
                )
                portfolio.orders.insert(0, record)
                return record

            # Deduct cash
            portfolio.current_cash = float(cash - total_cost)

            # Update position (average cost accounting)
            existing = portfolio.positions.get(sym)
            if existing:
                old_qty = _d(existing.quantity)
                old_avg = _d(existing.average_entry_price)
                new_qty = old_qty + qty
                new_avg = ((old_qty * old_avg) + (qty * exec_price)) / new_qty
                existing.quantity = float(new_qty)
                existing.average_entry_price = float(new_avg)
                existing.current_price = float(raw_price)
                existing.unrealized_pnl = float(new_qty * (_d(raw_price) - new_avg))
                existing.unrealized_pnl_percent = float(((_d(raw_price) - new_avg) / new_avg) * _d(100))
            else:
                unrealized = float(qty * (_d(raw_price) - exec_price))
                portfolio.positions[sym] = PositionState(
                    symbol=sym,
                    asset_type=asset_type,
                    quantity=float(qty),
                    average_entry_price=float(exec_price),
                    current_price=float(raw_price),
                    unrealized_pnl=unrealized,
                    unrealized_pnl_percent=0.0,
                )

        # 2. Sell execution: ensure user holds sufficient quantity
        elif order_req.side == "sell":
            existing = portfolio.positions.get(sym)
            if not existing or _d(existing.quantity) < qty:
                held = existing.quantity if existing else 0.0
                record = PaperOrderRecord(
                    portfolio_id=portfolio.id,
                    symbol=sym,
                    side="sell",
                    order_type=order_req.order_type,
                    quantity=float(qty),
                    price=float(exec_price),
                    fees=float(fee),
                    total_cost=float(total_cost),
                    status="rejected",
                    rejection_reason=f"Insufficient units held: attempted to sell {float(qty)}, held {held}.",
                )
                portfolio.orders.insert(0, record)
                return record

            # Add proceeds to cash
            portfolio.current_cash = float(cash + total_cost)

            # Realize P&L
            entry_cost = qty * _d(existing.average_entry_price)
            realized = (exec_price * qty) - entry_cost - fee
            portfolio.realized_pnl = float(_d(portfolio.realized_pnl) + realized)

            # Update or remove position
            remaining_qty = _d(existing.quantity) - qty
            if remaining_qty <= Decimal("0"):
                del portfolio.positions[sym]
            else:
                existing.quantity = float(remaining_qty)
                existing.current_price = float(raw_price)
                existing.unrealized_pnl = float(remaining_qty * (_d(raw_price) - _d(existing.average_entry_price)))

        # Record successful fill
        fill_record = PaperOrderRecord(
            portfolio_id=portfolio.id,
            symbol=sym,
            side=order_req.side,
            order_type=order_req.order_type,
            quantity=float(qty),
            price=float(exec_price),
            fees=float(fee),
            total_cost=float(total_cost),
            status="filled",
        )
        portfolio.orders.insert(0, fill_record)
        return fill_record
