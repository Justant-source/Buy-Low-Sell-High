from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

from ...domain.models import MarketBar
from ...domain.money import D


class CsvMarketDataProvider:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load_bars(self, symbol: str) -> list[MarketBar]:
        bars: list[MarketBar] = []
        with self.path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if row.get("symbol") != symbol:
                    continue
                bars.append(
                    MarketBar(
                        symbol=symbol,
                        session_date=date.fromisoformat(row["session_date"]),
                        open=D(row["open"]),
                        high=D(row["high"]),
                        low=D(row["low"]),
                        close=D(row["close"]),
                        adj_close=D(row.get("adj_close", row["close"])),
                        volume=int(row.get("volume", 0) or 0),
                        dividend=D(row.get("dividend", 0) or 0),
                        split_ratio=D(row.get("split_ratio", 1) or 1),
                        source=row.get("source", "csv"),
                    )
                )
        return bars

