from __future__ import annotations

from typing import Callable

from .repositories import InMemoryJobRepository


def run_once(repository: InMemoryJobRepository, owner: str, execute: Callable[[str], str]) -> str | None:
    job = repository.claim(owner)
    if job is None:
        return None
    if job.cancel_requested:
        repository.fail(job.job_id, "Cancelled before execution")
        return None
    try:
        run_id = execute(job.job_id)
    except Exception as exc:  # pragma: no cover - defensive wrapper
        repository.fail(job.job_id, str(exc))
        return None
    repository.complete(job.job_id, run_id)
    return run_id

