"""Asynchronous Research Job Lifecycle Manager."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from backend.app.engine.adapter import execute_research_run


class JobState(BaseModel):
    """Runtime research job state and progress."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    symbol: str
    asset_type: str = "stock"
    trade_date: str
    status: str = "queued"  # queued, running, completed, failed, cancelled
    progress_percent: int = 0
    current_step: str = "Job queued for execution"
    error_message: str | None = None
    result: dict[str, Any] | None = None
    markdown_report: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    completed_at: str | None = None


class JobManager:
    """Manages active and historical research jobs in-memory with DB sync hooks."""

    def __init__(self):
        self._jobs: dict[str, JobState] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    def get_job(self, job_id: str) -> JobState | None:
        """Lookup job state by ID."""
        return self._jobs.get(job_id)

    def list_jobs(self, user_id: str | None = None) -> list[JobState]:
        """List jobs, optionally filtered by user ID."""
        if user_id:
            return [j for j in self._jobs.values() if j.user_id == user_id]
        return list(self._jobs.values())

    def cancel_job(self, job_id: str, user_id: str) -> bool:
        """Cancel a queued or active job."""
        job = self._jobs.get(job_id)
        if not job or job.user_id != user_id:
            return False

        if job.status in ("completed", "failed", "cancelled"):
            return False

        job.status = "cancelled"
        job.completed_at = datetime.now(UTC).isoformat()
        job.current_step = "Execution cancelled by user"

        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        return True

    async def submit_job(
        self,
        user_id: str,
        symbol: str,
        trade_date: str,
        asset_type: str = "stock",
        analysts: list[str] | None = None,
        config_overrides: dict[str, Any] | None = None,
    ) -> JobState:
        """Enqueue and launch a new asynchronous research run."""
        job = JobState(
            user_id=user_id,
            symbol=symbol.strip().upper(),
            trade_date=trade_date,
            asset_type=asset_type,
            status="queued",
            progress_percent=5,
            current_step="Initializing agent team environment",
        )
        self._jobs[job.id] = job

        # Launch non-blocking background task
        task = asyncio.create_task(
            self._run_job_worker(job.id, analysts, config_overrides)
        )
        self._tasks[job.id] = task
        return job

    async def _run_job_worker(
        self,
        job_id: str,
        analysts: list[str] | None,
        config_overrides: dict[str, Any] | None,
    ):
        """Worker task executing graph propagation in a thread."""
        job = self._jobs.get(job_id)
        if not job or job.status == "cancelled":
            return

        job.status = "running"
        job.progress_percent = 25
        job.current_step = "Analyst team gathering market data and news"

        try:
            # Execute synchronous graph propagate in thread pool
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                execute_research_run,
                job.symbol,
                job.trade_date,
                job.asset_type,
                analysts,
                config_overrides,
            )

            job.progress_percent = 85
            job.current_step = "Synthesizing consensus report and debate conclusions"

            # Generate consolidated Markdown report
            md_lines = [
                f"# TradingAgents Research Report: {job.symbol}",
                f"- **Analysis Date**: {job.trade_date}",
                f"- **Asset Class**: {job.asset_type.upper()}",
                f"- **Consensus Rating**: {result.get('rating', 'REVIEW')}",
                f"- **Generated At**: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}",
                "",
                "## I. Portfolio Manager Decision",
                result.get("debates", {}).get("final_decision", "No decision rendered."),
                "",
                "## II. Analyst Reports",
            ]
            for name, report in result.get("reports", {}).items():
                if report:
                    md_lines.extend([f"### {name.title()} Report", report, ""])

            job.markdown_report = "\n".join(md_lines)
            job.result = result
            job.status = "completed"
            job.progress_percent = 100
            job.current_step = "Research consensus complete"
            job.completed_at = datetime.now(UTC).isoformat()

        except asyncio.CancelledError:
            job.status = "cancelled"
            job.current_step = "Execution cancelled"
            job.completed_at = datetime.now(UTC).isoformat()
        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)
            job.current_step = f"Execution failed: {exc}"
            job.completed_at = datetime.now(UTC).isoformat()


# Global singleton job manager
job_manager = JobManager()
