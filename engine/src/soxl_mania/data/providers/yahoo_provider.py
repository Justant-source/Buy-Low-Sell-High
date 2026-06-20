from __future__ import annotations

from datetime import UTC, date, datetime
from hashlib import sha256
from pathlib import Path
import json
import time
import urllib.parse
import urllib.request

from ...domain.models import MarketBar
from ...domain.money import D, ZERO


class YahooMarketDataProvider:
    _USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/137.0.0.0 Safari/537.36"
    )

    def __init__(
        self,
        timeout_seconds: int = 30,
        *,
        cache_dir: str | Path | None = None,
        chunk_years: int = 5,
        sleep_seconds: float = 0.25,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.cache_dir = Path(cache_dir) if cache_dir is not None else self._default_cache_dir()
        self.chunk_years = chunk_years
        self.sleep_seconds = sleep_seconds
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def load_bars(
        self,
        symbol: str,
        *,
        start_date: str = "2011-01-01",
        end_date: str | None = None,
    ) -> list[MarketBar]:
        effective_end = end_date or datetime.now(UTC).date().isoformat()
        chunk_ranges = self._chunk_ranges(start_date, effective_end)
        bars: list[MarketBar] = []
        for index, (chunk_start, chunk_end) in enumerate(chunk_ranges):
            payload = self._load_chunk_payload(symbol, chunk_start, chunk_end)
            bars.extend(self._parse_chart_payload(symbol, payload))
            if index < len(chunk_ranges) - 1 and self.sleep_seconds > 0:
                time.sleep(self.sleep_seconds)
        return self._dedupe_bars(bars)

    def _default_cache_dir(self) -> Path:
        return Path(__file__).resolve().parents[5] / "data" / "snapshots" / "yahoo_chart"

    def _chunk_ranges(self, start_date: str, end_date: str) -> list[tuple[str, str]]:
        start_value = date.fromisoformat(start_date)
        end_value = date.fromisoformat(end_date)
        if start_value >= end_value:
            return [(start_date, end_date)]
        ranges: list[tuple[str, str]] = []
        cursor = start_value
        while cursor < end_value:
            next_cursor = min(end_value, self._add_years(cursor, self.chunk_years))
            ranges.append((cursor.isoformat(), next_cursor.isoformat()))
            cursor = next_cursor
        return ranges

    def _add_years(self, value: date, years: int) -> date:
        try:
            return value.replace(year=value.year + years)
        except ValueError:
            return value.replace(year=value.year + years, month=2, day=28)

    def _load_chunk_payload(self, symbol: str, start_date: str, end_date: str) -> dict:
        start_ts = int(datetime.fromisoformat(start_date).replace(tzinfo=UTC).timestamp())
        end_ts = int(datetime.fromisoformat(end_date).replace(tzinfo=UTC).timestamp())
        query = urllib.parse.urlencode(
            {
                "period1": start_ts,
                "period2": end_ts,
                "interval": "1d",
                "includePrePost": "false",
                "events": "div,splits",
            }
        )
        cache_path = self._cache_path(symbol, start_date, end_date)
        errors: list[str] = []
        for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
            url = f"https://{host}/v8/finance/chart/{symbol}?{query}"
            request = urllib.request.Request(url, headers=self._request_headers(symbol))
            try:
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                self._write_cache(cache_path, payload)
                return payload
            except Exception as exc:
                errors.append(f"{host}: {exc}")
        cached = self._read_cache(cache_path)
        if cached is not None:
            return cached
        raise RuntimeError(
            f"Yahoo chart download failed for {symbol} {start_date}..{end_date}: " + " | ".join(errors)
        )

    def _request_headers(self, symbol: str) -> dict[str, str]:
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://finance.yahoo.com",
            "Referer": f"https://finance.yahoo.com/quote/{symbol}/history?p={symbol}",
            "User-Agent": self._USER_AGENT,
        }

    def _cache_path(self, symbol: str, start_date: str, end_date: str) -> Path:
        cache_key = sha256(f"{symbol}|{start_date}|{end_date}|1d|div,splits".encode("utf-8")).hexdigest()[:16]
        filename = f"{symbol.lower()}_{start_date}_{end_date}_{cache_key}.json"
        return self.cache_dir / filename

    def _read_cache(self, path: Path) -> dict | None:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _write_cache(self, path: Path, payload: dict) -> None:
        path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    def _dedupe_bars(self, bars: list[MarketBar]) -> list[MarketBar]:
        unique_by_date: dict[date, MarketBar] = {}
        for bar in bars:
            unique_by_date[bar.session_date] = bar
        return [unique_by_date[session_date] for session_date in sorted(unique_by_date)]

    def _parse_chart_payload(self, symbol: str, payload: dict) -> list[MarketBar]:
        chart = payload.get("chart", {})
        if chart.get("error"):
            raise RuntimeError(str(chart["error"]))
        results = chart.get("result") or []
        if not results:
            raise RuntimeError("Yahoo chart payload did not contain result rows")
        result = results[0]
        timestamps = result.get("timestamp") or []
        quote_payloads = result.get("indicators", {}).get("quote") or []
        if not quote_payloads:
            raise RuntimeError("Yahoo chart payload did not contain quote indicators")
        quote = quote_payloads[0]
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
            close = quote.get("close", [None])[index]
            open_ = quote.get("open", [None])[index]
            high = quote.get("high", [None])[index]
            low = quote.get("low", [None])[index]
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
                    volume=int((quote.get("volume") or [0])[index] or 0),
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
