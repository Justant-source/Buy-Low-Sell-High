from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from itertools import product
from typing import Any

from ..backtest.engine import run_backtest
from ..domain.enums import ExecutionModel, PriceBasis, SizingMode, ThreadSelector
from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D
from .research_common import (
    PARAMETER_SWEEP_DEFINITION,
    PARAMETER_SWEEP_ID,
    as_number,
    build_macro_segment_presets,
    mean_decimal,
    segment_rows_from_daily,
    stable_hash,
    stddev_decimal,
    sweep_hash,
)


def _format_param(value: int | float | Decimal) -> str:
    if isinstance(value, Decimal):
        return format(value, "f").rstrip("0").rstrip(".") or "0"
    if isinstance(value, float):
        return format(value, "g")
    return str(value)


def _combo_key(params: dict[str, int | float | Decimal]) -> str:
    return (
        f"t{_format_param(params['thread_count'])}"
        f"-s{_format_param(params['stop_sessions'])}"
        f"-tp{_format_param(params['take_profit_pct'])}"
        f"-ed{_format_param(params['entry_drop_pct'])}"
        f"-sl{_format_param(params['stop_loss_pct'])}"
        f"-me{_format_param(params['max_entries_per_session'])}"
    )


def _build_sweep_config(
    base_config: StrategyConfig,
    params: dict[str, int | float | Decimal],
    *,
    fixed_values: dict[str, Any],
    execution_model: str,
    price_basis: str,
) -> StrategyConfig:
    return replace(
        base_config,
        thread_count=int(params["thread_count"]),
        stop_sessions=int(params["stop_sessions"]),
        take_profit_pct=D(params["take_profit_pct"]),
        entry_drop_pct=D(params["entry_drop_pct"]),
        stop_loss_pct=D(params["stop_loss_pct"]),
        max_entries_per_session=int(params["max_entries_per_session"]),
        take_profit_operator=str(fixed_values.get("take_profit_operator", "gt")),
        thread_selector=ThreadSelector(str(fixed_values.get("thread_selector", "round_robin"))),
        allow_same_session_thread_reuse=bool(fixed_values.get("allow_same_session_thread_reuse", True)),
        sizing_mode=SizingMode(str(fixed_values.get("sizing_mode", "fixed_principal"))),
        execution_model=ExecutionModel(execution_model),
        price_basis=PriceBasis(price_basis),
        profile_id=_combo_key(params),
    )


def _iter_parameter_rows(definition: dict[str, Any]) -> list[dict[str, int | float]]:
    values = definition["parameter_values"]
    keys = [
        "thread_count",
        "stop_sessions",
        "take_profit_pct",
        "entry_drop_pct",
        "stop_loss_pct",
        "max_entries_per_session",
    ]
    rows: list[dict[str, int | float]] = []
    for combo in product(*(values[key] for key in keys)):
        rows.append(dict(zip(keys, combo, strict=True)))
    return rows


def _pareto_flags(
    rows: list[dict[str, Any]],
    *,
    left_key: str,
    right_key: str,
    right_higher_is_better: bool,
) -> set[str]:
    def nested_decimal(row: dict[str, Any], key: str) -> Decimal:
        current: Any = row
        for segment in key.split("."):
            current = current[segment]
        return D(str(current))

    frontier: set[str] = set()
    for row in rows:
        dominated = False
        left_value = nested_decimal(row, left_key)
        right_value = nested_decimal(row, right_key)
        for other in rows:
            if other["combo_key"] == row["combo_key"]:
                continue
            other_left = nested_decimal(other, left_key)
            other_right = nested_decimal(other, right_key)
            right_better_or_equal = other_right >= right_value if right_higher_is_better else other_right <= right_value
            right_strict = other_right > right_value if right_higher_is_better else other_right < right_value
            if other_left >= left_value and right_better_or_equal and (other_left > left_value or right_strict):
                dominated = True
                break
        if not dominated:
            frontier.add(str(row["combo_key"]))
    return frontier


def build_parameter_sweep(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION,
    sweep_id: str = PARAMETER_SWEEP_ID,
    execution_model: str = "next_open",
    price_basis: str = "adjusted_close",
) -> dict[str, Any]:
    period_start = bars[0].session_date
    period_end = bars[-1].session_date
    segment_presets = build_macro_segment_presets(period_start, period_end)
    rows: list[dict[str, Any]] = []
    fixed_values = definition.get("fixed_values", {})

    for params in _iter_parameter_rows(definition):
        config = _build_sweep_config(
            base_config,
            params,
            fixed_values=fixed_values,
            execution_model=execution_model,
            price_basis=price_basis,
        )
        run = run_backtest(bars, config, data_hash=data_hash)
        segment_rows = segment_rows_from_daily(run.daily, segment_presets)
        segment_returns = [D(row["return_pct"]) for row in segment_rows]
        recent_row = segment_rows[-1] if segment_rows else None
        row = {
            "combo_key": config.profile_id,
            "config_hash": config.config_hash(),
            "params": {
                "thread_count": int(params["thread_count"]),
                "stop_sessions": int(params["stop_sessions"]),
                "take_profit_pct": as_number(D(params["take_profit_pct"])),
                "entry_drop_pct": as_number(D(params["entry_drop_pct"])),
                "stop_loss_pct": as_number(D(params["stop_loss_pct"])),
                "max_entries_per_session": int(params["max_entries_per_session"]),
            },
            "metrics": {
                "full_return_pct": as_number(run.metrics["total_return_pct"]),
                "max_drawdown_pct": as_number(run.metrics["max_drawdown_pct"]),
                "volatility_pct": as_number(run.metrics["volatility_pct"]),
                "trade_count": int(run.metrics["trade_count"]),
                "mean_segment_return_pct": as_number(mean_decimal(segment_returns)),
                "segment_stddev_pct": as_number(stddev_decimal(segment_returns)),
                "worst_segment_return_pct": as_number(min(segment_returns, default=D("0"))),
                "positive_segment_ratio_pct": round(
                    (sum(1 for value in segment_returns if value > D("0")) / len(segment_returns)) * 100,
                    2,
                )
                if segment_returns
                else 0.0,
                "recent_segment_return_pct": as_number(D(recent_row["return_pct"])) if recent_row else 0.0,
            },
            "yearly_returns_pct": {
                str(year): as_number(payload["return_pct"])
                for year, payload in run.yearly.items()
            },
            "segment_returns_pct": {
                segment["segment_id"]: as_number(D(segment["return_pct"]))
                for segment in segment_rows
            },
        }
        rows.append(row)

    pareto_return_mdd = _pareto_flags(
        rows,
        left_key="metrics.full_return_pct",
        right_key="metrics.max_drawdown_pct",
        right_higher_is_better=True,
    )
    pareto_return_stability = _pareto_flags(
        rows,
        left_key="metrics.mean_segment_return_pct",
        right_key="metrics.segment_stddev_pct",
        right_higher_is_better=False,
    )

    for row in rows:
        row["flags"] = {
            "pareto_return_mdd": row["combo_key"] in pareto_return_mdd,
            "pareto_return_stability": row["combo_key"] in pareto_return_stability,
        }

    ranked_rows = sorted(
        rows,
        key=lambda row: (
            -D(str(row["metrics"]["mean_segment_return_pct"])),
            D(str(row["metrics"]["segment_stddev_pct"])),
            -D(str(row["metrics"]["full_return_pct"])),
        ),
    )
    best_full = max(rows, key=lambda row: D(str(row["metrics"]["full_return_pct"])))
    best_robust = ranked_rows[0]
    warnings: list[str] = []
    if D(str(best_full["metrics"]["recent_segment_return_pct"])) < D("0"):
        warnings.append(
            f"최고 전체수익 조합 {best_full['combo_key']} 는 최근 구간 수익률이 {best_full['metrics']['recent_segment_return_pct']}% 입니다."
        )
    drift = D(str(best_full["metrics"]["full_return_pct"])) - D(str(best_full["metrics"]["recent_segment_return_pct"]))
    if drift > D("100"):
        warnings.append(
            f"최고 전체수익 조합 {best_full['combo_key']} 는 전체 대비 최근 성과 드리프트가 {as_number(drift)}%p 입니다."
        )
    if D(str(best_robust["metrics"]["segment_stddev_pct"])) > D("25"):
        warnings.append(
            f"최상위 강건 조합 {best_robust['combo_key']} 도 구간 표준편차가 {best_robust['metrics']['segment_stddev_pct']}% 입니다."
        )

    return {
        "meta": {
            "sweep_id": sweep_id,
            "sweep_hash": sweep_hash(definition),
            "symbol": base_config.symbol,
            "initial_capital": str(base_config.initial_capital),
            "execution_model": execution_model,
            "price_basis": price_basis,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "data_hash": data_hash,
            "code_commit": "workspace",
            "combo_count": len(rows),
            "segment_presets": segment_presets,
            "parameter_values": definition["parameter_values"],
        },
        "summary": {
            "best_full_return_combo": best_full["combo_key"],
            "best_robust_combo": best_robust["combo_key"],
            "pareto_return_mdd_count": len(pareto_return_mdd),
            "pareto_return_stability_count": len(pareto_return_stability),
            "ranking_basis": "mean_segment_return desc, segment_stddev asc, full_return desc",
        },
        "warnings": warnings,
        "rows": ranked_rows,
        "payload_hash": stable_hash({"sweep_id": sweep_id, "rows": ranked_rows}),
    }
