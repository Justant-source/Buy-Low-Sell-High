from __future__ import annotations

from ..backtest.parity import ParityResult


def format_parity_report(*results: ParityResult) -> str:
    lines: list[str] = []
    for result in results:
        lines.append(result.status)
        lines.extend(result.details)
    return "\n".join(lines)

