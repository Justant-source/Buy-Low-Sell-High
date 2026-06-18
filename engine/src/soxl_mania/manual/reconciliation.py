from __future__ import annotations

from ..domain.models import ManualLedger
from ..domain.money import ZERO


def reconcile_ledger(ledger: ManualLedger) -> list[str]:
    issues: list[str] = []
    for thread_id, thread in ledger.threads.items():
        if thread.quantity < ZERO:
            issues.append(f"Thread {thread_id} has negative quantity")
        if thread.cash < ZERO:
            issues.append(f"Thread {thread_id} has negative cash")
    return issues

