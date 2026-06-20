from __future__ import annotations

from collections import defaultdict
from hashlib import sha256
import json

from ..domain.models import DataImportReport, MarketBar, utc_now
from ..domain.money import D


def _adjusted_close_warnings(bars: list[MarketBar]) -> list[str]:
    if len(bars) < 200:
        return []
    if any(bar.adj_close != bar.close for bar in bars):
        return []
    if any(bar.dividend != D("0") for bar in bars):
        return []
    if any(bar.split_ratio != D("1") for bar in bars):
        return []
    return ["Adjusted-close basis appears unavailable: adj_close mirrors close for all rows"]


def validate_bars(bars: list[MarketBar]) -> list[str]:
    warnings: list[str] = []
    seen_dates: set[object] = set()
    for bar in bars:
        if bar.session_date in seen_dates:
            raise ValueError(f"Duplicate session date: {bar.session_date.isoformat()}")
        seen_dates.add(bar.session_date)
        if bar.low > bar.high:
            raise ValueError(f"Invalid OHLC bounds for {bar.session_date.isoformat()}")
        if not (bar.low <= bar.open <= bar.high):
            raise ValueError(f"Open outside range on {bar.session_date.isoformat()}")
        if not (bar.low <= bar.close <= bar.high):
            raise ValueError(f"Close outside range on {bar.session_date.isoformat()}")
        if bar.session_date.weekday() >= 5:
            warnings.append(f"Weekend row present: {bar.session_date.isoformat()}")
    return warnings


def compute_data_hash(bars: list[MarketBar]) -> str:
    normalized_rows = [
        {
            "symbol": bar.symbol,
            "session_date": bar.session_date.isoformat(),
            "open": str(bar.open),
            "high": str(bar.high),
            "low": str(bar.low),
            "close": str(bar.close),
            "adj_close": str(bar.adj_close),
            "volume": bar.volume,
            "dividend": str(bar.dividend),
            "split_ratio": str(bar.split_ratio),
            "source": bar.source,
        }
        for bar in bars
    ]
    payload = json.dumps(normalized_rows, sort_keys=True, separators=(",", ":"))
    return sha256(payload.encode("utf-8")).hexdigest()


def summarize_import(symbol: str, source: str, bars: list[MarketBar]) -> DataImportReport:
    warnings = validate_bars(bars) + _adjusted_close_warnings(bars)
    return DataImportReport(
        symbol=symbol,
        source=source,
        rows=len(bars),
        data_hash=compute_data_hash(bars),
        started_at=utc_now(),
        missing_fields=0,
        warnings=warnings,
    )


def annual_boundary_prices(bars: list[MarketBar]) -> dict[int, tuple[str, str]]:
    grouped: dict[int, list[MarketBar]] = defaultdict(list)
    for bar in bars:
        grouped[bar.session_date.year].append(bar)
    return {
        year: (str(year_bars[0].adj_close), str(year_bars[-1].adj_close))
        for year, year_bars in grouped.items()
    }


def apply_split_to_position(shares: object, entry_price: object, split_ratio: object) -> tuple[object, object]:
    split = D(split_ratio)
    if split == D("1"):
        return shares, entry_price
    return D(shares) * split, D(entry_price) / split
