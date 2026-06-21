from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
import json
from pathlib import Path

from ..symbols import default_market_data_csv, get_symbol_definition
from ..domain.models import MarketBar
from .providers.csv_provider import CsvMarketDataProvider
from .providers.naver_provider import NaverMarketDataProvider
from .synthetic import build_single_stock_leveraged_history
from .providers.investing_provider import InvestingMarketDataProvider
from .normalize import normalize_bars
from .providers.stooq_provider import StooqMarketDataProvider
from .providers.yahoo_provider import YahooMarketDataProvider, write_bars_to_csv
from .quality import compute_data_hash, summarize_import


def snapshot_manifest_path(output_csv: str | Path) -> Path:
    csv_path = Path(output_csv)
    repo_root = Path(__file__).resolve().parents[4]
    raw_root = repo_root / "data" / "raw"
    if csv_path.resolve().parent == raw_root.resolve():
        return repo_root / "data" / "manifests" / f"{csv_path.stem}.json"
    return csv_path.with_suffix(".manifest.json")


def write_snapshot_manifest(
    output_csv: str | Path,
    *,
    symbol: str,
    source: str,
    bars: list[MarketBar],
    data_hash: str,
    warnings: list[str],
    errors: list[str],
) -> Path:
    manifest_path = snapshot_manifest_path(output_csv)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "symbol": symbol,
        "source": source,
        "generated_at": datetime.now(UTC).isoformat(),
        "rows": len(bars),
        "start": bars[0].session_date.isoformat(),
        "end": bars[-1].session_date.isoformat(),
        "data_hash": data_hash,
        "output_csv": str(Path(output_csv).resolve()),
        "warnings": warnings,
        "errors": errors,
    }
    manifest_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest_path


def sync_history(
    output_csv: str | Path,
    *,
    symbol: str = "SOXL",
    start_date: str | None = None,
) -> dict[str, object]:
    definition = get_symbol_definition(symbol)
    effective_start_date = start_date or definition.dataset_start_date
    errors: list[str] = []
    warnings: list[str] = []
    bars: list[MarketBar] | None = None
    source: str | None = None
    if definition.sync_mode == "naver_daily":
        bars = normalize_bars(NaverMarketDataProvider().load_bars(symbol, start_date=effective_start_date))
        source = "naver"
    elif definition.sync_mode == "naver_synthetic":
        if not definition.underlying_symbol or not definition.actual_start_date or definition.leverage_factor is None:
            raise RuntimeError(f"Incomplete synthetic symbol metadata for {symbol}")
        naver_provider = NaverMarketDataProvider()
        underlying_bars = _load_underlying_bars(
            definition.underlying_symbol,
            start_date=effective_start_date,
            anchor_date=definition.actual_start_date,
            warnings=warnings,
        )
        actual_bars = normalize_bars(
            naver_provider.load_bars(symbol, start_date=definition.actual_start_date)
        )
        bars = normalize_bars(
            build_single_stock_leveraged_history(
                symbol=symbol,
                underlying_bars=underlying_bars,
                actual_bars=actual_bars,
                dataset_start_date=effective_start_date,
                actual_start_date=definition.actual_start_date,
                leverage_factor=Decimal(definition.leverage_factor),
            )
        )
        source = "naver_synthetic"
        warnings.append(
            f"Rows before {definition.actual_start_date} are synthetic and anchored to the actual {symbol} listing-day close"
        )
    else:
        providers = [
            ("yahoo_chart", lambda: YahooMarketDataProvider().load_bars(symbol, start_date=effective_start_date)),
            ("investing", lambda: InvestingMarketDataProvider().load_bars(symbol, start_date=effective_start_date)),
            ("stooq", lambda: StooqMarketDataProvider().load_bars(symbol, start_date=effective_start_date)),
        ]
        for provider_name, loader in providers:
            try:
                loaded = normalize_bars(loader())
                if loaded:
                    bars = [bar for bar in loaded if bar.session_date.isoformat() >= effective_start_date]
                    source = provider_name
                    break
            except Exception as exc:  # pragma: no cover - network fallback path
                errors.append(f"{provider_name}: {exc}")
    if bars is None or source is None:
        raise RuntimeError(f"Unable to download {symbol} history: " + " | ".join(errors))
    if bars[0].session_date.isoformat() != effective_start_date:
        warnings.append(
            f"Requested start date {effective_start_date} is not a trading session; first row is {bars[0].session_date.isoformat()}"
        )
    write_bars_to_csv(output_csv, bars)
    report = summarize_import(symbol, source, bars)
    data_hash = compute_data_hash(bars)
    manifest_path = write_snapshot_manifest(
        output_csv,
        symbol=symbol,
        source=source,
        bars=bars,
        data_hash=data_hash,
        warnings=report.warnings + warnings,
        errors=errors,
    )
    return {
        "symbol": symbol,
        "source": source,
        "rows": report.rows,
        "start": bars[0].session_date.isoformat(),
        "end": bars[-1].session_date.isoformat(),
        "data_hash": data_hash,
        "output_csv": str(output_csv),
        "manifest_path": str(manifest_path),
        "warnings": report.warnings + warnings,
        "errors": errors,
    }


def _load_underlying_bars(
    underlying_symbol: str,
    *,
    start_date: str,
    anchor_date: str,
    warnings: list[str],
) -> list[MarketBar]:
    snapshot_path = Path(default_market_data_csv(underlying_symbol))
    if snapshot_path.exists():
        loaded = normalize_bars(CsvMarketDataProvider(snapshot_path).load_bars(underlying_symbol))
        if loaded and loaded[0].session_date.isoformat() <= start_date and loaded[-1].session_date.isoformat() >= anchor_date:
            warnings.append(f"Reused local underlying snapshot for {underlying_symbol}: {snapshot_path.name}")
            return loaded
    return normalize_bars(NaverMarketDataProvider().load_bars(underlying_symbol, start_date=start_date))
