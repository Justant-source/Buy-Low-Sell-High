from __future__ import annotations

from ..domain.models import MarketBar


def normalize_bars(bars: list[MarketBar]) -> list[MarketBar]:
    unique_dates: set[object] = set()
    normalized: list[MarketBar] = []
    for bar in sorted(bars, key=lambda item: item.session_date):
        if bar.session_date in unique_dates:
            raise ValueError(f"Duplicate session date: {bar.session_date.isoformat()}")
        unique_dates.add(bar.session_date)
        normalized.append(bar)
    return normalized
