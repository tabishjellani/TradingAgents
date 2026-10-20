"""Asynchronous Research Job Lifecycle Manager."""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from backend.app.db.repository import db_repo
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
        """Lookup job state by ID, checking memory and persistent storage."""
        if job_id in self._jobs:
            return self._jobs[job_id]
        try:
            data = db_repo._read_local_store()
            job_dict = data.get("research_jobs", {}).get(job_id)
            if job_dict:
                state = JobState(**job_dict)
                self._jobs[job_id] = state
                return state
        except Exception:
            pass
        return None

    def list_jobs(self, user_id: str | None = None) -> list[JobState]:
        """List jobs, optionally filtered by user ID, combining in-memory and persistent records."""
        jobs_map = dict(self._jobs)
        with contextlib.suppress(Exception):
            data = db_repo._read_local_store()
            for j_id, j_dict in data.get("research_jobs", {}).items():
                if j_id not in jobs_map:
                    with contextlib.suppress(Exception):
                        jobs_map[j_id] = JobState(**j_dict)

        if user_id:
            return [j for j in jobs_map.values() if j.user_id == user_id]
        return list(jobs_map.values())

    async def recover_active_jobs(self):
        """Mark interrupted running/queued jobs as failed on process startup."""
        try:
            data = db_repo._read_local_store()
            mutated = False
            for job_data in data.get("research_jobs", {}).values():
                if job_data.get("status") in ("queued", "running"):
                    job_data["status"] = "failed"
                    job_data["error_message"] = "Process restarted while job was in progress. Marked failed."
                    job_data["completed_at"] = datetime.now(UTC).isoformat()
                    mutated = True
            if mutated:
                db_repo._write_local_store(data)
        except Exception:
            pass

    def cancel_job(self, job_id: str, user_id: str) -> bool:
        """Cancel a queued or active job."""
        job = self.get_job(job_id)
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
        token: str | None = None,
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
        asyncio.create_task(db_repo.save_research_job(job.model_dump(), token=token))

        # Launch non-blocking background task
        task = asyncio.create_task(
            self._run_job_worker(job.id, analysts, config_overrides, token=token)
        )
        self._tasks[job.id] = task
        return job

    async def _run_job_worker(
        self,
        job_id: str,
        analysts: list[str] | None,
        config_overrides: dict[str, Any] | None,
        token: str | None = None,
    ):
        """Worker task executing graph propagation in a thread."""
        job = self._jobs.get(job_id)
        if not job or job.status == "cancelled":
            return

        job.status = "running"
        job.progress_percent = 25
        job.current_step = "Analyst team gathering market data and news"
        await db_repo.save_research_job(job.model_dump(), token=token)

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
            await db_repo.save_research_job(job.model_dump(), token=token)

        except asyncio.CancelledError:
            job.status = "cancelled"
            job.current_step = "Execution cancelled"
            job.completed_at = datetime.now(UTC).isoformat()
            await db_repo.save_research_job(job.model_dump(), token=token)
        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)
            job.current_step = f"Execution failed: {exc}"
            job.completed_at = datetime.now(UTC).isoformat()
            await db_repo.save_research_job(job.model_dump(), token=token)


# Global singleton job manager
job_manager = JobManager()
