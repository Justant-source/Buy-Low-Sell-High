from __future__ import annotations

from collections import deque
from ..domain.models import BacktestJob, utc_now


class InMemoryJobRepository:
    def __init__(self) -> None:
        self.jobs: dict[str, BacktestJob] = {}
        self.completed_by_hash: dict[tuple[str, str], str] = {}
        self.queue: deque[str] = deque()

    def add(self, job: BacktestJob) -> None:
        cache_key = (job.config_hash, job.data_hash)
        if cache_key in self.completed_by_hash:
            existing_run = self.completed_by_hash[cache_key]
            job.status = "COMPLETED"
            job.run_id = existing_run
            self.jobs[job.job_id] = job
            return
        self.jobs[job.job_id] = job
        self.queue.append(job.job_id)

    def claim(self, owner: str) -> BacktestJob | None:
        while self.queue:
            job_id = self.queue.popleft()
            job = self.jobs[job_id]
            if job.status != "QUEUED" or job.cancel_requested:
                continue
            job.status = "RUNNING"
            job.owner = owner
            job.started_at = utc_now()
            return job
        return None

    def complete(self, job_id: str, run_id: str) -> None:
        job = self.jobs[job_id]
        job.status = "COMPLETED"
        job.finished_at = utc_now()
        job.run_id = run_id
        job.progress = 100
        self.completed_by_hash[(job.config_hash, job.data_hash)] = run_id

    def fail(self, job_id: str, error_message: str) -> None:
        job = self.jobs[job_id]
        job.status = "FAILED"
        job.error_message = error_message
        job.finished_at = utc_now()

    def request_cancel(self, job_id: str) -> None:
        self.jobs[job_id].cancel_requested = True

    def reset_orphans(self) -> None:
        for job in self.jobs.values():
            if job.status == "RUNNING":
                job.status = "QUEUED"
                job.owner = None
                self.queue.appendleft(job.job_id)
