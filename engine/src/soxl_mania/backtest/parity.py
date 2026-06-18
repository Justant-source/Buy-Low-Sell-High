from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json

from ..data.quality import annual_boundary_prices
from ..domain.models import BacktestRun, MarketBar


@dataclass(frozen=True)
class ParityResult:
    status: str
    details: list[str]


def load_reference_fixture(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def check_data_parity(bars: list[MarketBar], reference: dict) -> ParityResult:
    boundaries = annual_boundary_prices(bars)
    failures: list[str] = []
    for row in reference["annual_soxl_boundaries"]:
        year = int(row["year"])
        actual = boundaries.get(year)
        if actual is None:
            failures.append(f"Missing bars for {year}")
            continue
        expected = (str(row["start"]), str(row["end"]))
        if actual != expected:
            failures.append(f"{year}: expected {expected[0]}->{expected[1]} got {actual[0]}->{actual[1]}")
    if failures:
        return ParityResult("DATA_MISMATCH", failures)
    return ParityResult("PASS", ["Annual adjusted-close boundaries match"])


def check_event_parity(run: BacktestRun, reference: dict, profile_key: str) -> ParityResult:
    expected = reference["event_counts"].get(profile_key)
    if expected is None:
        return ParityResult("NOT_APPLICABLE", [f"No event fixture for {profile_key}"])
    failures: list[str] = []
    for year, payload in expected.items():
        actual = run.yearly.get(int(year), {})
        expected_tp = payload["take_profit"]
        expected_ts = payload["time_stop"]
        if actual.get("take_profit_count") != expected_tp or actual.get("time_stop_count") != expected_ts:
            failures.append(
                f"{year}: expected {expected_tp}/{expected_ts} got {actual.get('take_profit_count')}/{actual.get('time_stop_count')}"
            )
    if failures:
        return ParityResult("FAIL", failures)
    return ParityResult("PASS", [f"Event counts match {profile_key}"])


def check_performance_parity(run: BacktestRun, reference: dict, profile_key: str) -> ParityResult:
    expected = reference["annual_returns"].get(profile_key)
    if expected is None:
        return ParityResult("NOT_APPLICABLE", [f"No performance fixture for {profile_key}"])
    failures: list[str] = []
    for year, expected_return in expected.items():
        actual = run.yearly.get(int(year), {}).get("return_pct")
        if actual is None:
            failures.append(f"{year}: missing actual yearly return")
            continue
        if abs(float(actual) - float(expected_return)) > 0.15:
            failures.append(f"{year}: expected {expected_return} got {actual}")
    if failures:
        return ParityResult("FAIL", failures)
    return ParityResult("PASS", [f"Yearly returns within tolerance for {profile_key}"])

