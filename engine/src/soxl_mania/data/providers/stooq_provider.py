from __future__ import annotations

import csv
from datetime import date
from io import StringIO
import urllib.parse
import urllib.request

from ...domain.models import MarketBar
from ...domain.money import D


class StooqMarketDataProvider:
    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def load_bars(self, symbol: str) -> list[MarketBar]:
        query = urllib.parse.urlencode({"s": f"{symbol.lower()}.us", "i": "d"})
        url = f"https://stooq.com/q/d/l/?{query}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
            text = response.read().decode("utf-8")
        reader = csv.DictReader(StringIO(text))
        bars: list[MarketBar] = []
        for row in reader:
            if not row.get("Date"):
                continue
            bars.append(
                MarketBar(
                    symbol=symbol,
                    session_date=date.fromisoformat(row["Date"]),
                    open=D(row["Open"]),
                    high=D(row["High"]),
                    low=D(row["Low"]),
                    close=D(row["Close"]),
                    adj_close=D(row["Close"]),
                    volume=int(row.get("Volume", 0) or 0),
                    source="stooq",
                )
            )
        return bars
