"""API endpoints for TradingAgents research jobs and report retrieval."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.auth import UserClaims, get_current_user
from backend.app.engine.job_manager import JobState, job_manager

router = APIRouter(prefix="/api/v1/research", tags=["Research"])


class JobSubmissionRequest(BaseModel):
    """Payload for submitting a new research job."""

    symbol: str = Field(description="Ticker symbol, e.g. NVDA or BTC-USD")
    trade_date: str = Field(description="Historical or current date in YYYY-MM-DD format")
    asset_type: str = Field(default="stock", description="'stock' or 'crypto'")
    analysts: list[str] = Field(
        default_factory=lambda: ["market", "news", "fundamentals"],
        description="Analyst teams to deploy",
    )
    config_overrides: dict[str, Any] = Field(default_factory=dict)


@router.post("/jobs", response_model=JobState, status_code=status.HTTP_202_ACCEPTED)
async def submit_research_job(
    request: JobSubmissionRequest,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> JobState:
    """Submit a research run to the background job manager."""
    return await job_manager.submit_job(
        user_id=current_user.id,
        symbol=request.symbol,
        trade_date=request.trade_date,
        asset_type=request.asset_type,
        analysts=request.analysts,
        config_overrides=request.config_overrides,
    )


@router.get("/jobs", response_model=list[JobState])
async def list_research_jobs(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> list[JobState]:
    """Retrieve all research jobs belonging to the authenticated user."""
    return job_manager.list_jobs(user_id=current_user.id)


@router.get("/jobs/{job_id}", response_model=JobState)
async def get_research_job(
    job_id: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> JobState:
    """Retrieve status, live progress, and result of a specific research job."""
    job = job_manager.get_job(job_id)
    if not job or job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research job not found.",
        )
    return job


@router.get("/jobs/{job_id}/report")
async def get_job_report(
    job_id: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
    format: Literal["json", "markdown"] = "json",
) -> Any:
    """Retrieve generated research consensus report."""
    job = job_manager.get_job(job_id)
    if not job or job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research job not found.",
        )

    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Report not available. Job is currently in '{job.status}' status.",
        )

    if format == "markdown":
        return {"markdown": job.markdown_report}

    return {
        "job_id": job.id,
        "symbol": job.symbol,
        "trade_date": job.trade_date,
        "asset_type": job.asset_type,
        "result": job.result,
        "markdown": job.markdown_report,
    }


@router.post("/jobs/{job_id}/cancel")
async def cancel_research_job(
    job_id: str,
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> dict[str, str]:
    """Cancel a queued or active research job."""
    success = job_manager.cancel_job(job_id, user_id=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job cannot be cancelled (either not found or already completed/cancelled).",
        )
    return {"status": "cancelled", "job_id": job_id}
