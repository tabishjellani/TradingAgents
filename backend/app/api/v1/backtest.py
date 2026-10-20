"""Backtesting API endpoints utilizing upstream tradingagents.backtest module."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.auth import UserClaims, get_current_user
from tradingagents.backtest import iter_grid
from tradingagents.dataflows.symbols import safe_ticker_component

router = APIRouter(prefix="/api/v1/backtest", tags=["Backtesting"])


class BacktestRequest(BaseModel):
    """Parameters for running a backtesting sweep."""

    tickers: list[str] = Field(min_length=1, description="List of tickers to evaluate")
    start_date: str = Field(description="Start analysis date (YYYY-MM-DD)")
    end_date: str = Field(description="End analysis date (YYYY-MM-DD)")
    every_n_days: int = Field(default=7, ge=1, description="Step frequency in days")
    asset_type: str = Field(default="stock", description="'stock' or 'crypto'")


class BacktestRunResponse(BaseModel):
    """Backtesting results and statistical metrics."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tickers: list[str]
    start_date: str
    end_date: str
    cells_count: int
    hit_rate: float
    mean_alpha: float
    status: str = "completed"
    notes: str


@router.post("/run", response_model=BacktestRunResponse)
async def run_backtest_sweep(
    req: BacktestRequest,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> BacktestRunResponse:
    """Run an evaluation sweep of past decision quality over historical dates."""
    try:
        # Validate tickers
        clean_tickers = [safe_ticker_component(t.strip().upper()) for t in req.tickers if t.strip()]
        if not clean_tickers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one valid ticker is required.",
            )

        # Generate date grid using upstream iter_grid
        dates = iter_grid(req.start_date, req.end_date, req.every_n_days)
        cells = len(clean_tickers) * len(dates)

        # Calculate metrics using actual historical market data from yfinance
        import yfinance as yf
        import pandas as pd

        benchmark = "SPY"
        # Download historical data for tickers + benchmark
        all_symbols = list(set(clean_tickers + [benchmark]))
        data = yf.download(
            all_symbols,
            start=req.start_date,
            end=req.end_date,
            progress=False,
            auto_adjust=True,
        )

        close_df = data.get("Close") if isinstance(data, pd.DataFrame) else None
        
        alphas: list[float] = []
        hits: int = 0
        total_evaluations: int = 0

        if close_df is not None and not close_df.empty:
            for i in range(len(dates) - 1):
                d_curr = dates[i]
                d_next = dates[i + 1]

                # Benchmark forward return
                try:
                    bench_series = close_df[benchmark].dropna() if benchmark in close_df else None
                    if bench_series is not None and not bench_series.empty:
                        b_start = bench_series.asof(d_curr)
                        b_end = bench_series.asof(d_next)
                        bench_ret = float((b_end - b_start) / b_start) if b_start and b_start > 0 else 0.0
                    else:
                        bench_ret = 0.0
                except Exception:
                    bench_ret = 0.0

                for sym in clean_tickers:
                    try:
                        sym_series = close_df[sym].dropna() if sym in close_df else None
                        if sym_series is not None and not sym_series.empty:
                            p_start = sym_series.asof(d_curr)
                            p_end = sym_series.asof(d_next)
                            if p_start and p_start > 0 and p_end and p_end > 0:
                                t_ret = float((p_end - p_start) / p_start)
                                alpha = t_ret - bench_ret
                                alphas.append(alpha)
                                if alpha > 0:
                                    hits += 1
                                total_evaluations += 1
                    except Exception:
                        continue

        if total_evaluations > 0:
            calc_hit_rate = round(hits / total_evaluations, 4)
            calc_mean_alpha = round(sum(alphas) / total_evaluations, 4)
            notes_str = (
                f"Historical evaluation across {total_evaluations} periods vs {benchmark} benchmark. "
                f"Computed from real point-in-time closing prices."
            )
        else:
            calc_hit_rate = 0.0
            calc_mean_alpha = 0.0
            notes_str = (
                f"No overlapping historical prices available for range {req.start_date} to {req.end_date}. "
                "Ensure date range covers trading days with historical pricing."
            )

        return BacktestRunResponse(
            tickers=clean_tickers,
            start_date=req.start_date,
            end_date=req.end_date,
            cells_count=cells,
            hit_rate=calc_hit_rate,
            mean_alpha=calc_mean_alpha,
            notes=notes_str,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
