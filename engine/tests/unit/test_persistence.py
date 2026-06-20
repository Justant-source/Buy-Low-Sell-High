from __future__ import annotations

from buy_low_sell_high.domain.models import BacktestJob
from buy_low_sell_high.persistence.repositories import InMemoryJobRepository
from buy_low_sell_high.persistence.worker import run_once
import unittest


class PersistenceTest(unittest.TestCase):
    def test_workers_do_not_duplicate_same_job(self) -> None:
        repo = InMemoryJobRepository()
        repo.add(BacktestJob(job_id="job-1", config_hash="c", data_hash="d"))
        first = repo.claim("worker-a")
        second = repo.claim("worker-b")
        self.assertIsNotNone(first)
        self.assertIsNone(second)

    def test_completed_hash_is_reused(self) -> None:
        repo = InMemoryJobRepository()
        repo.add(BacktestJob(job_id="job-1", config_hash="c", data_hash="d"))
        repo.complete("job-1", "run-1")
        cached = BacktestJob(job_id="job-2", config_hash="c", data_hash="d")
        repo.add(cached)
        self.assertEqual(repo.jobs["job-2"].status, "COMPLETED")
        self.assertEqual(repo.jobs["job-2"].run_id, "run-1")

    def test_failure_is_recorded(self) -> None:
        repo = InMemoryJobRepository()
        repo.add(BacktestJob(job_id="job-1", config_hash="c", data_hash="d"))
        run_once(repo, "worker-a", lambda _job_id: (_ for _ in ()).throw(RuntimeError("boom")))
        self.assertEqual(repo.jobs["job-1"].status, "FAILED")
        self.assertEqual(repo.jobs["job-1"].error_message, "boom")

    def test_orphan_running_job_is_reset(self) -> None:
        repo = InMemoryJobRepository()
        repo.add(BacktestJob(job_id="job-1", config_hash="c", data_hash="d"))
        repo.claim("worker-a")
        repo.reset_orphans()
        self.assertEqual(repo.jobs["job-1"].status, "QUEUED")


if __name__ == "__main__":
    unittest.main()

