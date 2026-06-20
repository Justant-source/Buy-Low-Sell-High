from __future__ import annotations

from pathlib import Path
import json
from typing import Any

from ..domain.models import MarketBar, StrategyConfig
from .official_explorer import build_official_explorer
from .mentor_matrix import (
    DEFAULT_COMBOS,
    _actual_benchmark_aggregate_rows,
    _actual_benchmark_yearly,
    _actual_combo_payloads,
)


def default_reference_path() -> Path:
    return Path(__file__).resolve().parents[4] / "engine" / "tests" / "fixtures" / "official_reference_matrix.json"


def default_explorer_reference_path() -> Path:
    return Path(__file__).resolve().parents[4] / "engine" / "tests" / "fixtures" / "official_explorer_summary.json"


def load_reference_fixture(path: str | Path | None = None) -> dict[str, Any]:
    fixture_path = Path(path) if path is not None else default_reference_path()
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def load_explorer_reference_fixture(path: str | Path | None = None) -> dict[str, Any]:
    fixture_path = Path(path) if path is not None else default_explorer_reference_path()
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def build_official_matrix(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str,
    combos: tuple[tuple[int, int], ...] = DEFAULT_COMBOS,
) -> dict[str, Any]:
    if not bars:
        raise ValueError("No bars provided")
    years = sorted({bar.session_date.year for bar in bars})
    windows = _official_windows(years)
    benchmark_yearly = _actual_benchmark_yearly(bars, years, base_config)
    combo_payloads = _actual_combo_payloads(bars, base_config, data_hash, combos, windows, years=years)
    official_combo_key = f"{base_config.thread_count}x{base_config.stop_sessions}"
    selection = build_official_explorer(bars, base_config, data_hash=data_hash)
    return {
        "meta": {
            "symbol": base_config.symbol,
            "period_start": bars[0].session_date.isoformat(),
            "period_end": bars[-1].session_date.isoformat(),
            "initial_capital": str(base_config.initial_capital),
            "price_basis": base_config.price_basis.value,
            "execution_model": base_config.execution_model.value,
            "config_hash": base_config.config_hash(),
            "data_hash": data_hash,
            "code_commit": "workspace",
            "windows": {name: {"start_year": start, "end_year": end} for name, (start, end) in windows.items()},
            "official_profile_id": base_config.profile_id,
            "official_combo_key": official_combo_key,
        },
        "benchmark": {
            "yearly": benchmark_yearly,
            "aggregate_rows": _actual_benchmark_aggregate_rows(benchmark_yearly, windows),
        },
        "combos": combo_payloads,
        "selected_count_combos": {
            official_combo_key: {
                "yearly_counts": combo_payloads[official_combo_key]["yearly_counts"],
                "aggregate_rows": combo_payloads[official_combo_key]["aggregate_count_rows"],
            }
        }
        if official_combo_key in combo_payloads
        else {},
        "selection": selection,
    }


def compare_to_reference(actual: dict[str, Any], reference: dict[str, Any]) -> dict[str, Any]:
    if actual == reference:
        return {
            "status": "PASS",
            "first_mismatch": None,
        }
    mismatch = _first_mismatch(actual, reference, path=())
    return {
        "status": "FAIL",
        "first_mismatch": mismatch,
    }


def _official_windows(years: list[int]) -> dict[str, tuple[int, int]]:
    first_year = years[0]
    last_year = years[-1]
    return {
        "total": (first_year, last_year),
        "y5": (max(first_year, last_year - 4), last_year),
        "y3": (max(first_year, last_year - 2), last_year),
        "y1": (last_year, last_year),
    }


def _first_mismatch(actual: Any, reference: Any, *, path: tuple[str, ...]) -> dict[str, Any]:
    if isinstance(actual, dict) and isinstance(reference, dict):
        for key in sorted(set(actual) | set(reference)):
            if key not in actual or key not in reference:
                return {
                    "path": ".".join((*path, str(key))),
                    "expected": reference.get(key) if isinstance(reference, dict) else reference,
                    "actual": actual.get(key) if isinstance(actual, dict) else actual,
                }
            if actual[key] != reference[key]:
                return _first_mismatch(actual[key], reference[key], path=(*path, str(key)))
    if isinstance(actual, list) and isinstance(reference, list):
        for index in range(max(len(actual), len(reference))):
            if index >= len(actual) or index >= len(reference):
                return {
                    "path": ".".join((*path, str(index))),
                    "expected": reference[index] if index < len(reference) else "missing",
                    "actual": actual[index] if index < len(actual) else "missing",
                }
            if actual[index] != reference[index]:
                return _first_mismatch(actual[index], reference[index], path=(*path, str(index)))
    return {
        "path": ".".join(path),
        "expected": reference,
        "actual": actual,
    }
