from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SymbolDefinition:
    symbol: str
    csv_filename: str
    dataset_start_date: str
    sync_mode: str = "market_fallback"
    actual_start_date: str | None = None
    underlying_symbol: str | None = None
    leverage_factor: str | None = None


_SYMBOLS: dict[str, SymbolDefinition] = {
    "SOXL": SymbolDefinition(
        symbol="SOXL",
        csv_filename="soxl_daily_2011_present.csv",
        dataset_start_date="2011-01-01",
        sync_mode="market_fallback",
    ),
    "TQQQ": SymbolDefinition(
        symbol="TQQQ",
        csv_filename="tqqq_daily_2011_present.csv",
        dataset_start_date="2011-01-01",
        sync_mode="market_fallback",
    ),
    "000660": SymbolDefinition(
        symbol="000660",
        csv_filename="000660_daily_2015_present.csv",
        dataset_start_date="2015-01-01",
        sync_mode="naver_daily",
    ),
    "0193T0": SymbolDefinition(
        symbol="0193T0",
        csv_filename="0193t0_daily_2015_present.csv",
        dataset_start_date="2015-01-01",
        sync_mode="naver_synthetic",
        actual_start_date="2026-05-27",
        underlying_symbol="000660",
        leverage_factor="2",
    ),
    "233740": SymbolDefinition(
        symbol="233740",
        csv_filename="233740_daily_2015_present.csv",
        dataset_start_date="2015-12-17",
        sync_mode="naver_daily",
    ),
    "462330": SymbolDefinition(
        symbol="462330",
        csv_filename="462330_daily_2023_present.csv",
        dataset_start_date="2023-07-04",
        sync_mode="naver_daily",
    ),
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def get_symbol_definition(symbol: str) -> SymbolDefinition:
    upper_symbol = symbol.upper()
    fallback = SymbolDefinition(
        symbol=upper_symbol,
        csv_filename=f"{upper_symbol.lower()}_daily_2011_present.csv",
        dataset_start_date="2011-01-01",
        sync_mode="market_fallback",
    )
    return _SYMBOLS.get(upper_symbol, fallback)


def default_market_data_csv(symbol: str = "SOXL") -> str:
    definition = get_symbol_definition(symbol)
    return str(repo_root() / "data" / "raw" / definition.csv_filename)
