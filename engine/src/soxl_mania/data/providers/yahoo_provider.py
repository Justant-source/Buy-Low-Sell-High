from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
import json
import urllib.parse
import urllib.request

from ...domain.models import MarketBar
from ...domain.money import D, ZERO


class YahooMarketDataProvider:
    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def load_bars(
        self,
        symbol: str,
        *,
        start_date: str = "2011-01-01",
        end_date: str | None = None,
    ) -> list[MarketBar]:
        start_ts = int(datetime.fromisoformat(start_date).replace(tzinfo=UTC).timestamp())
        end_value = end_date or datetime.now(UTC).date().isoformat()
        end_ts = int(datetime.fromisoformat(end_value).replace(tzinfo=UTC).timestamp())
        query = urllib.parse.urlencode(
            {
                "period1": start_ts,
                "period2": end_ts,
                "interval": "1d",
                "includePrePost": "false",
                "events": "div,splits",
            }
        )
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?{query}"
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
            },
        )
        with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return self._parse_chart_payload(symbol, payload)

    def _parse_chart_payload(self, symbol: str, payload: dict) -> list[MarketBar]:
        result = payload["chart"]["result"][0]
        timestamps = result["timestamp"]
        quote = result["indicators"]["quote"][0]
        adjusted = result["indicators"].get("adjclose", [{"adjclose": quote["close"]}])[0]["adjclose"]
        events = result.get("events", {})
        dividends = {
            datetime.fromtimestamp(int(ts), UTC).date(): D(item.get("amount", 0))
            for ts, item in events.get("dividends", {}).items()
        }
        splits = {
            datetime.fromtimestamp(int(ts), UTC).date(): D(item.get("numerator", 1)) / D(item.get("denominator", 1))
            for ts, item in events.get("splits", {}).items()
        }
        bars: list[MarketBar] = []
        for index, timestamp in enumerate(timestamps):
            close = quote["close"][index]
            open_ = quote["open"][index]
            high = quote["high"][index]
            low = quote["low"][index]
            if None in {open_, high, low, close}:
                continue
            session_date = datetime.fromtimestamp(int(timestamp), UTC).date()
            bars.append(
                MarketBar(
                    symbol=symbol,
                    session_date=session_date,
                    open=D(open_),
                    high=D(high),
                    low=D(low),
                    close=D(close),
                    adj_close=D(adjusted[index]),
                    volume=int(quote["volume"][index] or 0),
                    dividend=dividends.get(session_date, ZERO),
                    split_ratio=splits.get(session_date, D("1")),
                    source="yahoo_chart",
                )
            )
        return bars


def write_bars_to_csv(path: str | Path, bars: list[MarketBar]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "symbol,session_date,open,high,low,close,adj_close,volume,dividend,split_ratio,source"
    ]
    for bar in bars:
        lines.append(
            ",".join(
                [
                    bar.symbol,
                    bar.session_date.isoformat(),
                    str(bar.open),
                    str(bar.high),
                    str(bar.low),
                    str(bar.close),
                    str(bar.adj_close),
                    str(bar.volume),
                    str(bar.dividend),
                    str(bar.split_ratio),
                    bar.source,
                ]
            )
        )
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
