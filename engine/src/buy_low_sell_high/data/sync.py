from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path

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
    bars: list[object],
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
        raise RuntimeError(f"Unable to download {symbol} history: " + " | ".join(errors))
    write_bars_to_csv(output_csv, bars)
    report = summarize_import(symbol, source, bars)
    data_hash = compute_data_hash(bars)
    manifest_path = write_snapshot_manifest(
        output_csv,
        symbol=symbol,
        source=source,
        bars=bars,
        data_hash=data_hash,
        warnings=report.warnings,
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
        "warnings": report.warnings,
        "errors": errors,
    }
