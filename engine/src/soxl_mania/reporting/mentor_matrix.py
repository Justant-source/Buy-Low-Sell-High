from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import json
from typing import Any

from ..backtest.engine import run_backtest
from ..domain.enums import SizingMode
from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D, ZERO

DEFAULT_COMBOS: tuple[tuple[int, int], ...] = (
    (5, 10),
    (5, 30),
    (5, 40),
    (6, 10),
    (6, 30),
    (6, 40),
    (7, 10),
    (7, 30),
    (7, 40),
)
DEFAULT_WINDOWS: dict[str, tuple[int, int]] = {
    "total": (2011, 2024),
    "y5": (2020, 2024),
    "y3": (2022, 2024),
    "y1": (2024, 2024),
}
DEFAULT_SELECTED_COUNT_COMBOS: tuple[str, ...] = ("5x30", "6x10", "6x30", "7x30")
DISPLAY_PRICE = D("0.01")
DISPLAY_PERCENT = D("0.1")
COUNT_AVERAGE_QUANT = D("0.1")


@dataclass(frozen=True)
class MentorMatrixMismatch:
    section: str
    row: str
    column: str
    expected: str
    actual: str

    def to_dict(self) -> dict[str, str]:
        return {
            "section": self.section,
            "row": self.row,
            "column": self.column,
            "expected": self.expected,
            "actual": self.actual,
        }


def default_reference_path() -> Path:
    return Path(__file__).resolve().parents[4] / "engine" / "tests" / "fixtures" / "mentor_reference_matrix.yaml"


def load_reference_fixture(path: str | Path | None = None) -> dict[str, Any]:
    fixture_path = Path(path) if path is not None else default_reference_path()
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def build_mentor_matrix(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str,
    reference: dict[str, Any] | None = None,
    combos: tuple[tuple[int, int], ...] = DEFAULT_COMBOS,
    windows: dict[str, tuple[int, int]] | None = None,
    selected_count_combos: tuple[str, ...] = DEFAULT_SELECTED_COUNT_COMBOS,
) -> dict[str, Any]:
    if not bars:
        raise ValueError("No bars provided")
    windows = windows or DEFAULT_WINDOWS
    reference_payload = reference or load_reference_fixture()
    years = sorted({bar.session_date.year for bar in bars if 2011 <= bar.session_date.year <= 2024})
    benchmark_yearly = _actual_benchmark_yearly(bars, years, base_config)
    combo_payloads = _actual_combo_payloads(bars, base_config, data_hash, combos, windows)
    actual = {
        "benchmark": {
            "yearly": benchmark_yearly,
            "aggregate_rows": _actual_benchmark_aggregate_rows(benchmark_yearly, windows),
        },
        "combos": combo_payloads,
        "selected_count_combos": {
            combo_key: {
                "yearly_counts": combo_payloads[combo_key]["yearly_counts"],
                "aggregate_rows": combo_payloads[combo_key]["aggregate_count_rows"],
            }
            for combo_key in selected_count_combos
            if combo_key in combo_payloads
        },
    }
    parity = compare_to_reference(actual, reference_payload, data_hash=data_hash)
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
            "reference_fixture_path": str(default_reference_path()),
            "reference_image_sha256": reference_payload["meta"]["source_image_sha256"],
        },
        "reference": reference_payload,
        "actual": actual,
        "parity": {
            "status": parity["status"],
            "data_status": parity["data_status"],
            "value_status": parity["value_status"],
            "first_mismatch": parity["first_mismatch"],
            "mismatches": parity["mismatches"],
        },
    }


def compare_to_reference(actual: dict[str, Any], reference: dict[str, Any], *, data_hash: str) -> dict[str, Any]:
    mismatches: list[MentorMatrixMismatch] = []

    reference_yearly = {int(row["year"]): row for row in reference["benchmark"]["yearly"]}
    actual_yearly = {int(row["year"]): row for row in actual["benchmark"]["yearly"]}
    for year in sorted(reference_yearly):
        actual_row = actual_yearly.get(year)
        if actual_row is None:
            mismatches.append(
                MentorMatrixMismatch("benchmark.yearly", str(year), "price_change", reference_yearly[year]["price_change"], "missing")
            )
            continue
        if actual_row["price_change"] != reference_yearly[year]["price_change"]:
            mismatches.append(
                MentorMatrixMismatch(
                    "benchmark.yearly",
                    str(year),
                    "price_change",
                    reference_yearly[year]["price_change"],
                    actual_row["price_change"],
                )
            )
            break

    if mismatches:
        return {
            "status": "DATA_MISMATCH",
            "data_status": "DATA_MISMATCH",
            "value_status": "NOT_APPLICABLE",
            "first_mismatch": mismatches[0].to_dict(),
            "mismatches": [item.to_dict() for item in mismatches[:10]],
            "data_hash": data_hash,
        }

    for combo_key, combo_reference in reference["combos"].items():
        combo_actual = actual["combos"].get(combo_key)
        if combo_actual is None:
            mismatches.append(MentorMatrixMismatch("combos", combo_key, "combo", "present", "missing"))
            break
        _compare_numeric_map(
            mismatches,
            section=f"combos.{combo_key}.yearly_returns_pct",
            expected=combo_reference["yearly_returns_pct"],
            actual=combo_actual["yearly_returns_pct"],
            tolerance=D("0.1"),
        )
        _compare_numeric_map(
            mismatches,
            section=f"combos.{combo_key}.stats_pct",
            expected=combo_reference["stats_pct"],
            actual=combo_actual["stats_pct"],
            tolerance=D("0.1"),
        )
        _compare_numeric_map(
            mismatches,
            section=f"combos.{combo_key}.simple_returns_pct",
            expected=combo_reference["simple_returns_pct"],
            actual=combo_actual["simple_returns_pct"],
            tolerance=D("0.5"),
        )
        _compare_numeric_map(
            mismatches,
            section=f"combos.{combo_key}.compound_returns_pct",
            expected=combo_reference["compound_returns_pct"],
            actual=combo_actual["compound_returns_pct"],
            tolerance=D("0.5"),
        )
        if mismatches:
            break

    if not mismatches:
        for combo_key, combo_reference in reference["selected_count_combos"].items():
            combo_actual = actual["selected_count_combos"].get(combo_key)
            if combo_actual is None:
                mismatches.append(MentorMatrixMismatch("selected_count_combos", combo_key, "combo", "present", "missing"))
                break
            _compare_nested_counts(
                mismatches,
                section=f"selected_count_combos.{combo_key}.yearly_counts",
                expected=combo_reference["yearly_counts"],
                actual=combo_actual["yearly_counts"],
                tolerance=D("0"),
            )
            _compare_nested_counts(
                mismatches,
                section=f"selected_count_combos.{combo_key}.aggregate_rows",
                expected=combo_reference["aggregate_rows"],
                actual=combo_actual["aggregate_rows"],
                tolerance=D("0.5"),
            )
            if mismatches:
                break

    return {
        "status": "PASS" if not mismatches else "FAIL",
        "data_status": "PASS",
        "value_status": "PASS" if not mismatches else "FAIL",
        "first_mismatch": mismatches[0].to_dict() if mismatches else None,
        "mismatches": [item.to_dict() for item in mismatches[:10]],
        "data_hash": data_hash,
    }


def _compare_numeric_map(
    mismatches: list[MentorMatrixMismatch],
    *,
    section: str,
    expected: dict[str, Any],
    actual: dict[str, Any],
    tolerance: Decimal,
) -> None:
    for column, expected_value in expected.items():
        actual_value = actual.get(column)
        if actual_value is None:
            mismatches.append(MentorMatrixMismatch(section, section, column, str(expected_value), "missing"))
            return
        if abs(D(str(actual_value)) - D(str(expected_value))) > tolerance:
            mismatches.append(MentorMatrixMismatch(section, section, column, str(expected_value), str(actual_value)))
            return


def _compare_nested_counts(
    mismatches: list[MentorMatrixMismatch],
    *,
    section: str,
    expected: dict[str, Any],
    actual: dict[str, Any],
    tolerance: Decimal,
) -> None:
    for row, expected_row in expected.items():
        actual_row = actual.get(row)
        if actual_row is None:
            mismatches.append(MentorMatrixMismatch(section, row, "row", str(expected_row), "missing"))
            return
        for column in ("take_profit", "time_stop"):
            actual_value = actual_row.get(column)
            expected_value = expected_row[column]
            if actual_value is None:
                mismatches.append(MentorMatrixMismatch(section, row, column, str(expected_value), "missing"))
                return
            if abs(D(str(actual_value)) - D(str(expected_value))) > tolerance:
                mismatches.append(MentorMatrixMismatch(section, row, column, str(expected_value), str(actual_value)))
                return


def _actual_combo_payloads(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    data_hash: str,
    combos: tuple[tuple[int, int], ...],
    windows: dict[str, tuple[int, int]],
) -> dict[str, Any]:
    payloads: dict[str, Any] = {}
    years = sorted({bar.session_date.year for bar in bars if 2011 <= bar.session_date.year <= 2024})

    for thread_count, stop_sessions in combos:
        combo_key = f"{thread_count}x{stop_sessions}"
        yearly_runs: dict[int, Any] = {}
        yearly_returns: dict[str, Decimal] = {}
        yearly_counts: dict[str, dict[str, int]] = {}

        for year in years:
            year_bars = _bars_for_year(bars, year)
            if not year_bars:
                continue
            run = run_backtest(
                year_bars,
                _config_for_combo(
                    base_config,
                    thread_count=thread_count,
                    stop_sessions=stop_sessions,
                    sizing_mode=SizingMode.FIXED_PRINCIPAL,
                ),
                data_hash=data_hash,
            )
            yearly_runs[year] = run
            yearly_returns[str(year)] = _display_percent(run.metrics["total_return_pct"])
            yearly_counts[str(year)] = {
                "take_profit": int(run.metrics["take_profit_count"]),
                "time_stop": int(run.metrics["time_stop_count"]),
            }

        simple_window_runs = {
            name: run_backtest(
                _bars_for_window(bars, *window),
                _config_for_combo(
                    base_config,
                    thread_count=thread_count,
                    stop_sessions=stop_sessions,
                    sizing_mode=SizingMode.FIXED_PRINCIPAL,
                ),
                data_hash=data_hash,
            )
            for name, window in windows.items()
            if _bars_for_window(bars, *window)
        }
        compound_window_runs = {
            name: run_backtest(
                _bars_for_window(bars, *window),
                _config_for_combo(
                    base_config,
                    thread_count=thread_count,
                    stop_sessions=stop_sessions,
                    sizing_mode=SizingMode.THREAD_COMPOUND,
                ),
                data_hash=data_hash,
            )
            for name, window in windows.items()
            if _bars_for_window(bars, *window)
        }

        payloads[combo_key] = {
            "thread_count": thread_count,
            "stop_sessions": stop_sessions,
            "yearly_returns_pct": {year: float(value) for year, value in yearly_returns.items()},
            "yearly_counts": yearly_counts,
            "stats_pct": {
                "stddev": float(_population_stddev(list(yearly_returns.values()))),
                "avg_all": float(_average(list(yearly_returns.values()))),
                "avg_5y": float(_average([value for year, value in yearly_returns.items() if int(year) >= 2020])),
            },
            "simple_returns_pct": {
                name: float(_display_percent(run.metrics["total_return_pct"]))
                for name, run in simple_window_runs.items()
                if name != "y1"
            },
            "compound_returns_pct": {
                name: float(_display_percent(run.metrics["total_return_pct"]))
                for name, run in compound_window_runs.items()
            },
            "aggregate_count_rows": {
                "avg_all": _average_count_row(yearly_counts.values()),
                "avg_5y": _average_count_row(
                    counts for year, counts in yearly_counts.items() if int(year) >= 2020
                ),
                "simple_total": _count_row_from_run(simple_window_runs.get("total")),
                "simple_y5": _count_row_from_run(simple_window_runs.get("y5")),
                "simple_y3": _count_row_from_run(simple_window_runs.get("y3")),
                "compound_total": _count_row_from_run(compound_window_runs.get("total")),
                "compound_y5": _count_row_from_run(compound_window_runs.get("y5")),
                "compound_y3": _count_row_from_run(compound_window_runs.get("y3")),
                "compound_y1": _count_row_from_run(compound_window_runs.get("y1")),
            },
        }
    return payloads


def _count_row_from_run(run: Any | None) -> dict[str, int] | dict[str, float]:
    if run is None:
        return {"take_profit": 0, "time_stop": 0}
    return {
        "take_profit": int(run.metrics["take_profit_count"]),
        "time_stop": int(run.metrics["time_stop_count"]),
    }


def _average_count_row(rows: Any) -> dict[str, float]:
    collected = list(rows)
    if not collected:
        return {"take_profit": 0.0, "time_stop": 0.0}
    take_profit = sum(D(str(row["take_profit"])) for row in collected) / D(len(collected))
    time_stop = sum(D(str(row["time_stop"])) for row in collected) / D(len(collected))
    return {
        "take_profit": float(take_profit.quantize(COUNT_AVERAGE_QUANT, rounding=ROUND_HALF_UP)),
        "time_stop": float(time_stop.quantize(COUNT_AVERAGE_QUANT, rounding=ROUND_HALF_UP)),
    }


def _actual_benchmark_yearly(
    bars: list[MarketBar],
    years: list[int],
    config: StrategyConfig,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for year in years:
        year_bars = _bars_for_year(bars, year)
        if not year_bars:
            continue
        start = year_bars[0].price_for_basis(config.price_basis)
        end = year_bars[-1].price_for_basis(config.price_basis)
        rows.append(
            {
                "year": year,
                "price_change": f"{_format_price(start)}->{_format_price(end)}",
                "return_pct": float(_display_percent(_return_pct(start, end))),
            }
        )
    return rows


def _actual_benchmark_aggregate_rows(yearly: list[dict[str, Any]], windows: dict[str, tuple[int, int]]) -> dict[str, float]:
    yearly_returns = {int(row["year"]): D(str(row["return_pct"])) for row in yearly}
    def window_return(name: str) -> float:
        window = windows.get(name)
        if window is None:
            return 0.0
        return float(_window_benchmark_return(yearly, window))

    return {
        "compound_total": window_return("total"),
        "average_5y": float(_average([value for year, value in yearly_returns.items() if year >= 2020])),
        "simple_5y": window_return("y5"),
        "compound_5y": window_return("y5"),
        "compound_3y": window_return("y3"),
        "compound_1y": window_return("y1"),
    }


def _window_benchmark_return(yearly: list[dict[str, Any]], window: tuple[int, int]) -> Decimal:
    start_year, end_year = window
    selected = [row for row in yearly if start_year <= int(row["year"]) <= end_year]
    if not selected:
        return ZERO
    first = selected[0]["price_change"].split("->")[0]
    last = selected[-1]["price_change"].split("->")[1]
    return _display_percent(_return_pct(D(first), D(last)))


def _config_for_combo(
    base_config: StrategyConfig,
    *,
    thread_count: int,
    stop_sessions: int,
    sizing_mode: SizingMode,
) -> StrategyConfig:
    return StrategyConfig.from_mapping(
        {
            **base_config.__dict__,
            "thread_count": thread_count,
            "stop_sessions": stop_sessions,
            "sizing_mode": sizing_mode.value,
            "profile_id": f"{thread_count}x{stop_sessions}",
        }
    )


def _bars_for_year(bars: list[MarketBar], year: int) -> list[MarketBar]:
    return [bar for bar in bars if bar.session_date.year == year]


def _bars_for_window(bars: list[MarketBar], start_year: int, end_year: int) -> list[MarketBar]:
    return [bar for bar in bars if start_year <= bar.session_date.year <= end_year]


def _return_pct(start: Decimal, end: Decimal) -> Decimal:
    if start == ZERO:
        return ZERO
    return ((end - start) / start) * D("100")


def _display_percent(value: Decimal | Any) -> Decimal:
    return D(str(value)).quantize(DISPLAY_PERCENT, rounding=ROUND_HALF_UP)


def _format_price(value: Decimal) -> str:
    return f"{value.quantize(DISPLAY_PRICE, rounding=ROUND_HALF_UP):.2f}"


def _average(values: list[Decimal]) -> Decimal:
    if not values:
        return ZERO
    return (sum(values, start=ZERO) / D(len(values))).quantize(DISPLAY_PERCENT, rounding=ROUND_HALF_UP)


def _population_stddev(values: list[Decimal]) -> Decimal:
    if not values:
        return ZERO
    mean = sum(values, start=ZERO) / D(len(values))
    variance = sum((value - mean) ** 2 for value in values) / D(len(values))
    return variance.sqrt().quantize(DISPLAY_PERCENT, rounding=ROUND_HALF_UP)
