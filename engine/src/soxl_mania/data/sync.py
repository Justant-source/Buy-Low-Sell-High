from __future__ import annotations

from pathlib import Path

from .providers.investing_provider import InvestingMarketDataProvider
from .normalize import normalize_bars
from .providers.stooq_provider import StooqMarketDataProvider
from .providers.yahoo_provider import YahooMarketDataProvider, write_bars_to_csv
from .quality import compute_data_hash, summarize_import


def sync_soxl_history(
    output_csv: str | Path,
    *,
    symbol: str = "SOXL",
    start_date: str = "2011-01-01",
) -> dict[str, object]:
    errors: list[str] = []
    providers = [
        ("yahoo_chart", lambda: YahooMarketDataProvider().load_bars(symbol, start_date=start_date)),
        ("investing", lambda: InvestingMarketDataProvider().load_bars(symbol, start_date=start_date)),
        ("stooq", lambda: StooqMarketDataProvider().load_bars(symbol, start_date=start_date)),
    ]
    bars = None
    source = None
    for provider_name, loader in providers:
        try:
            loaded = normalize_bars(loader())
            if loaded:
                bars = [bar for bar in loaded if bar.session_date.isoformat() >= start_date]
                source = provider_name
                break
        except Exception as exc:  # pragma: no cover - network fallback path
            errors.append(f"{provider_name}: {exc}")
    if bars is None or source is None:
        raise RuntimeError("Unable to download SOXL history: " + " | ".join(errors))
    write_bars_to_csv(output_csv, bars)
    report = summarize_import(symbol, source, bars)
    return {
        "symbol": symbol,
        "source": source,
        "rows": report.rows,
        "start": bars[0].session_date.isoformat(),
        "end": bars[-1].session_date.isoformat(),
        "data_hash": compute_data_hash(bars),
        "output_csv": str(output_csv),
        "warnings": report.warnings,
        "errors": errors,
    }
