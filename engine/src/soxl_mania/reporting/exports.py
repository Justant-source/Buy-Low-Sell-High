from __future__ import annotations

import csv
from io import StringIO

from ..domain.models import BacktestRun


def trades_to_csv(run: BacktestRun) -> str:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["thread_id", "entry_date", "entry_price", "exit_date", "exit_price", "close_reason", "pnl"])
    for trade in run.trades:
        writer.writerow(
            [
                trade.thread_id,
                trade.fill_entry_date.isoformat(),
                trade.entry_price,
                trade.fill_exit_date.isoformat() if trade.fill_exit_date else "",
                trade.exit_price or "",
                trade.close_reason.value if trade.close_reason else "",
                trade.pnl,
            ]
        )
    return buffer.getvalue()

