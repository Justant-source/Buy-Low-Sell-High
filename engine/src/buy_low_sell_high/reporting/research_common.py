from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from hashlib import sha256
import json
from math import sqrt
from typing import Any

from ..domain.enums import PriceBasis
from ..domain.models import DailySnapshot, MarketBar
from ..domain.money import D, ZERO, quantize_money

CORE_PROFILE_CATALOG_ID = "core_profiles_v2"
CORE_PROFILE_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "strategy_id": "5x30",
        "label": "5T / 30S",
        "thread_count": 5,
        "stop_sessions": 30,
        "mentor_profiles": ["soxl_default_5x30"],
    },
    {
        "strategy_id": "5x40",
        "label": "5T / 40S",
        "thread_count": 5,
        "stop_sessions": 40,
        "mentor_profiles": ["soxl_best_avg_5x40"],
    },
    {
        "strategy_id": "6x30",
        "label": "6T / 30S",
        "thread_count": 6,
        "stop_sessions": 30,
        "mentor_profiles": [],
    },
    {
        "strategy_id": "6x40",
        "label": "6T / 40S",
        "thread_count": 6,
        "stop_sessions": 40,
        "mentor_profiles": [],
    },
    {
        "strategy_id": "7x30",
        "label": "7T / 30S",
        "thread_count": 7,
        "stop_sessions": 30,
        "mentor_profiles": ["soxl_default_7x30"],
    },
    {
        "strategy_id": "7x40",
        "label": "7T / 40S",
        "thread_count": 7,
        "stop_sessions": 40,
        "mentor_profiles": [],
    },
)

PARAMETER_SWEEP_ID = "core4_v4"
PARAMETER_SWEEP_DEFINITION: dict[str, Any] = {
    "sweep_id": PARAMETER_SWEEP_ID,
    "parameter_values": {
        "thread_count": [5, 6, 7],
        "stop_sessions": [30, 40],
        "buy_pct": list(range(-10, 1)),
        "sell_pct": list(range(0, 11)),
    },
    "fixed_values": {
        "take_profit_operator": "gt",
        "thread_selector": "round_robin",
        "allow_same_session_thread_reuse": True,
        "sizing_mode": "fixed_principal",
        "stop_loss_pct": 0,
        "max_entries_per_session": 1,
        "price_basis": "adjusted_close",
        "execution_model": "next_open",
    },
}

_MACRO_SEGMENT_SPECS: tuple[tuple[str, str, int, int | None], ...] = (
    ("2011-2014", "2011-2014", 2011, 2014),
    ("2015-2018", "2015-2018", 2015, 2018),
    ("2019-2021", "2019-2021", 2019, 2021),
    ("2022-2024", "2022-2024", 2022, 2024),
    ("2025-latest", "2025-latest", 2025, None),
)


def _json_default(value: object) -> object:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, date):
        return value.isoformat()
    return value


def stable_hash(payload: object) -> str:
    raw = json.dumps(payload, sort_keys=True, default=_json_default)
    return sha256(raw.encode("utf-8")).hexdigest()


def catalog_hash(catalog: tuple[dict[str, Any], ...] = CORE_PROFILE_CATALOG) -> str:
    return stable_hash({"catalog_id": CORE_PROFILE_CATALOG_ID, "strategies": catalog})


def sweep_hash(definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION) -> str:
    return stable_hash(definition)


def as_number(value: Decimal | int | float | str) -> float:
    return round(float(value), 2)


def serialize_metric_value(value: object) -> object:
    if isinstance(value, Decimal):
        return str(value)
    return value


def serialize_metric_dict(values: dict[str, Any]) -> dict[str, Any]:
    return {key: serialize_metric_value(value) for key, value in values.items()}


def benchmark_daily_from_bars(
    bars: list[MarketBar],
    *,
    initial_capital: Decimal,
    price_basis: PriceBasis,
) -> list[DailySnapshot]:
    if not bars:
        return []
    start_price = bars[0].price_for_basis(price_basis)
    if start_price == ZERO:
        raise ValueError("Benchmark start price cannot be zero")
    peak_equity = initial_capital
    daily: list[DailySnapshot] = []
    for index, bar in enumerate(bars):
        price = bar.price_for_basis(price_basis)
        total_equity = quantize_money((initial_capital * price) / start_price)
        if total_equity > peak_equity:
            peak_equity = total_equity
        drawdown = ZERO if peak_equity == ZERO else quantize_money(((total_equity - peak_equity) / peak_equity) * D("100"))
        daily.append(
            DailySnapshot(
                session_date=bar.session_date,
                session_index=index,
                total_equity=total_equity,
                realized_pnl=quantize_money(total_equity - initial_capital),
                drawdown=drawdown,
                open_threads=0,
                entries=0,
                take_profits=0,
                time_stops=0,
                skipped_entries=0,
            )
        )
    return daily


def build_macro_segment_presets(period_start: date, period_end: date) -> list[dict[str, str]]:
    presets: list[dict[str, str]] = []
    for preset_id, label, start_year, end_year in _MACRO_SEGMENT_SPECS:
        raw_start = date(start_year, 1, 1)
        raw_end = date(period_end.year if end_year is None else end_year, 12, 31)
        start = max(raw_start, period_start)
        end = min(raw_end, period_end)
        if start > end:
            continue
        presets.append(
            {
                "preset_id": preset_id,
                "label": label,
                "start": start.isoformat(),
                "end": end.isoformat(),
            }
        )
    return presets


def build_slice_presets(period_start: date, period_end: date) -> list[dict[str, str]]:
    presets = [
        {
            "preset_id": "all",
            "label": "전체",
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
        }
    ]
    for year in range(period_start.year, period_end.year + 1):
        start = max(period_start, date(year, 1, 1))
        end = min(period_end, date(year, 12, 31))
        if start > end:
            continue
        presets.append(
            {
                "preset_id": f"year-{year}",
                "label": str(year),
                "start": start.isoformat(),
                "end": end.isoformat(),
            }
        )
    presets.extend(build_macro_segment_presets(period_start, period_end))
    return presets


def filter_daily(daily: list[DailySnapshot], start: date, end: date) -> list[DailySnapshot]:
    return [snapshot for snapshot in daily if start <= snapshot.session_date <= end]


def summarize_daily_slice(daily: list[DailySnapshot]) -> dict[str, Any] | None:
    if not daily:
        return None
    start_equity = daily[0].total_equity
    end_equity = daily[-1].total_equity
    pnl = quantize_money(end_equity - start_equity)
    return_pct = ZERO if start_equity == ZERO else quantize_money(((end_equity - start_equity) / start_equity) * D("100"))
    peak_equity = daily[0].total_equity
    max_drawdown = ZERO
    for snapshot in daily:
        if snapshot.total_equity > peak_equity:
            peak_equity = snapshot.total_equity
        if peak_equity == ZERO:
            continue
        drawdown = (snapshot.total_equity - peak_equity) / peak_equity
        if drawdown < max_drawdown:
            max_drawdown = drawdown
    return {
        "start": daily[0].session_date.isoformat(),
        "end": daily[-1].session_date.isoformat(),
        "start_equity": str(quantize_money(start_equity)),
        "end_equity": str(quantize_money(end_equity)),
        "pnl": str(pnl),
        "return_pct": str(return_pct),
        "max_drawdown_pct": str(quantize_money(max_drawdown * D("100"))),
        "session_count": len(daily),
    }


def monthly_summary_from_daily(daily: list[DailySnapshot]) -> list[dict[str, Any]]:
    by_month: dict[tuple[int, int], list[DailySnapshot]] = defaultdict(list)
    for snapshot in daily:
        by_month[(snapshot.session_date.year, snapshot.session_date.month)].append(snapshot)
    rows: list[dict[str, Any]] = []
    for (year, month), month_daily in sorted(by_month.items()):
        summary = summarize_daily_slice(month_daily)
        if summary is None:
            continue
        rows.append(
            {
                "month": f"{year:04d}-{month:02d}",
                **summary,
            }
        )
    return rows


def segment_rows_from_daily(
    daily: list[DailySnapshot],
    presets: list[dict[str, str]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for preset in presets:
        summary = summarize_daily_slice(
            filter_daily(
                daily,
                date.fromisoformat(preset["start"]),
                date.fromisoformat(preset["end"]),
            )
        )
        if summary is None:
            continue
        rows.append(
            {
                "segment_id": preset["preset_id"],
                "label": preset["label"],
                **summary,
            }
        )
    return rows


def serialize_daily(daily: list[DailySnapshot]) -> list[dict[str, Any]]:
    return [
        {
            "session_date": snapshot.session_date.isoformat(),
            "session_index": snapshot.session_index,
            "total_equity": str(snapshot.total_equity),
            "realized_pnl": str(snapshot.realized_pnl),
            "drawdown": str(snapshot.drawdown),
            "open_threads": snapshot.open_threads,
            "entries": snapshot.entries,
            "take_profits": snapshot.take_profits,
            "time_stops": snapshot.time_stops,
            "skipped_entries": snapshot.skipped_entries,
            "applied_regime": snapshot.applied_regime,
        }
        for snapshot in daily
    ]


def mean_decimal(values: list[Decimal]) -> Decimal:
    if not values:
        return ZERO
    return quantize_money(sum(values, start=ZERO) / D(len(values)))


def stddev_decimal(values: list[Decimal]) -> Decimal:
    if len(values) < 2:
        return ZERO
    mean = sum(values, start=ZERO) / D(len(values))
    variance = sum((value - mean) ** 2 for value in values) / D(len(values))
    return quantize_money(D(str(sqrt(float(variance)))))
