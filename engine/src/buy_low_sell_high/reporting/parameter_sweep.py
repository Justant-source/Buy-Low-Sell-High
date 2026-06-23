from __future__ import annotations

from dataclasses import replace
from datetime import date
from decimal import Decimal
from math import log10
from typing import Any

from ..backtest.engine import run_backtest
from ..code_version import current_code_commit
from ..domain.enums import ExecutionModel, PriceBasis, SizingMode, ThreadSelector
from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D, ZERO
from .research_common import (
    EVALUATION_WINDOW_MAX_COUNT,
    PARAMETER_SWEEP_DEFINITION,
    PARAMETER_SWEEP_ID,
    RECENT_WINDOW_SPAN,
    as_number,
    build_yearly_evaluation_windows,
    build_macro_segment_presets,
    filter_daily,
    mean_decimal,
    segment_rows_from_daily,
    summarize_daily_slice,
    stable_hash,
    stddev_decimal,
    sweep_hash,
)
from .strategy_specs import dynamic_strategy_id
from .sweep_runner import SweepExecutionPlan, build_sweep_execution_plan, build_sweep_spec, execute_sweep_chunks

PARAMETER_SWEEP_PARAMETER_KEYS = ("thread_count", "stop_sessions", "buy_pct", "sell_pct")
PARAMETER_SWEEP_STRATEGY_FAMILY = "ddeolsao_pal.parameter"
PARAMETER_SWEEP_SPEC_VERSION = "cartesian-v1"


def _format_param(value: int | float | Decimal) -> str:
    if isinstance(value, Decimal):
        return format(value, "f").rstrip("0").rstrip(".") or "0"
    if isinstance(value, float):
        return format(value, "g")
    return str(value)


def _combo_key(params: dict[str, int | float | Decimal]) -> str:
    return dynamic_strategy_id(
        int(params["thread_count"]),
        int(params["stop_sessions"]),
        Decimal(str(params["buy_pct"])),
        Decimal(str(params["sell_pct"])),
    )


def _as_precise_number(value: Decimal | float | int, digits: int = 4) -> float:
    return round(float(value), digits)


def _param_lookup_key(value: int | float | Decimal) -> str:
    if isinstance(value, Decimal):
        return _format_param(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return _format_param(value)


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
        take_profit_pct=D(params["sell_pct"]),
        entry_drop_pct=D(params["buy_pct"]),
        stop_loss_pct=D(str(fixed_values.get("stop_loss_pct", 0))),
        max_entries_per_session=int(fixed_values.get("max_entries_per_session", 1)),
        take_profit_operator=str(fixed_values.get("take_profit_operator", "gt")),
        thread_selector=ThreadSelector(str(fixed_values.get("thread_selector", "round_robin"))),
        allow_same_session_thread_reuse=bool(fixed_values.get("allow_same_session_thread_reuse", True)),
        sizing_mode=SizingMode(str(fixed_values.get("sizing_mode", "fixed_principal"))),
        execution_model=ExecutionModel(execution_model),
        price_basis=PriceBasis(price_basis),
        profile_id=_combo_key(params),
    )


def _resolve_sweep_execution_plan(
    definition: dict[str, Any],
    *,
    sweep_id: str,
    max_workers: int = 0,
    chunk_size: int = 0,
) -> tuple[SweepExecutionPlan, list[list[dict[str, Any]]]]:
    spec = build_sweep_spec(
        sweep_id=sweep_id,
        strategy_family=PARAMETER_SWEEP_STRATEGY_FAMILY,
        parameter_keys=PARAMETER_SWEEP_PARAMETER_KEYS,
        parameter_values=definition["parameter_values"],
        fixed_values=definition.get("fixed_values", {}),
        spec_version=PARAMETER_SWEEP_SPEC_VERSION,
    )
    plan, _, chunks = build_sweep_execution_plan(
        spec,
        max_workers=max_workers if max_workers > 0 else None,
        chunk_size=chunk_size if chunk_size > 0 else None,
    )
    return plan, chunks


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


def _window_rows_from_daily(
    daily: list[Any],
    windows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for window in windows:
        window_start = date.fromisoformat(str(window["start"]))
        window_end = date.fromisoformat(str(window["end"]))
        summary = summarize_daily_slice(
            filter_daily(
                daily,
                start=window_start,
                end=window_end,
            )
        )
        if summary is None:
            continue
        start_equity = Decimal(str(summary["start_equity"]))
        end_equity = Decimal(str(summary["end_equity"]))
        growth_ratio = ZERO if start_equity == ZERO else end_equity / start_equity
        rows.append(
            {
                "window_id": window["window_id"],
                "label": window["label"],
                "year": window["year"],
                "start": window["start"],
                "end": window["end"],
                "session_count": int(summary["session_count"]),
                "start_equity": str(start_equity),
                "end_equity": str(end_equity),
                "return_pct": as_number(Decimal(str(summary["return_pct"]))),
                "cagr_pct": as_number(Decimal(str(summary["cagr_pct"]))),
                "max_drawdown_pct": as_number(Decimal(str(summary["max_drawdown_pct"]))),
                "growth_ratio": _as_precise_number(growth_ratio),
            }
        )
    return rows


def _recent_slice_from_windows(
    daily: list[Any],
    windows: list[dict[str, Any]],
    *,
    recent_window_span: int = RECENT_WINDOW_SPAN,
) -> dict[str, Any] | None:
    if not windows:
        return None
    recent_windows = windows[-recent_window_span:]
    if not recent_windows:
        return None
    recent_start = date.fromisoformat(str(recent_windows[0]["start"]))
    recent_end = date.fromisoformat(str(recent_windows[-1]["end"]))
    summary = summarize_daily_slice(
        filter_daily(
            daily,
            start=recent_start,
            end=recent_end,
        )
    )
    if summary is None:
        return None
    return {
        "window_ids": [window["window_id"] for window in recent_windows],
        "start": recent_windows[0]["start"],
        "end": recent_windows[-1]["end"],
        "return_pct": as_number(Decimal(str(summary["return_pct"]))),
        "cagr_pct": as_number(Decimal(str(summary["cagr_pct"]))),
        "max_drawdown_pct": as_number(Decimal(str(summary["max_drawdown_pct"]))),
        "start_equity": str(summary["start_equity"]),
        "end_equity": str(summary["end_equity"]),
    }


def _baseline_combo_candidates() -> tuple[str, ...]:
    return (
        dynamic_strategy_id(5, 40, D("0"), D("0")),
        dynamic_strategy_id(5, 30, D("0"), D("0")),
    )


def _select_baseline_row(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    by_combo = {str(row["combo_key"]): row for row in rows}
    for combo_key in _baseline_combo_candidates():
        if combo_key in by_combo:
            return by_combo[combo_key]
    return rows[0] if rows else None


def _assign_tier_flags(
    rows: list[dict[str, Any]],
    *,
    baseline_mean_cagr_pct: Decimal,
    baseline_std_cagr_pct: Decimal,
) -> None:
    std_limit = baseline_std_cagr_pct * D("1.2") if baseline_std_cagr_pct > ZERO else D("999999")
    for row in rows:
        trade_returns = [Decimal(str(value)) for value in row.pop("_trade_returns", [])]
        min_trade_return_pct = min(trade_returns, default=ZERO)
        window_cagrs = [Decimal(str(window["cagr_pct"])) for window in row["windows"]]
        mean_cagr_pct = Decimal(str(row["metrics"]["mean_cagr_pct"]))
        std_cagr_pct = Decimal(str(row["metrics"]["std_cagr_pct"]))
        tier_1 = min_trade_return_pct > D("-100")
        tier_2 = all(value > ZERO for value in window_cagrs) if window_cagrs else False
        tier_3 = mean_cagr_pct > baseline_mean_cagr_pct
        tier_4 = std_cagr_pct < std_limit
        row["tier_pass"] = tier_1 and tier_2 and tier_3 and tier_4
        row["tier_details"] = {
            "tier_1_no_trade_collapse": tier_1,
            "tier_2_all_windows_positive": tier_2,
            "tier_3_mean_cagr_above_baseline": tier_3,
            "tier_4_std_cagr_below_limit": tier_4,
            "baseline_mean_cagr_pct": as_number(baseline_mean_cagr_pct),
            "baseline_std_cagr_pct": as_number(baseline_std_cagr_pct),
            "std_cagr_limit_pct": as_number(std_limit),
            "min_trade_return_pct": as_number(min_trade_return_pct),
        }


def _assign_plateau_classes(
    rows: list[dict[str, Any]],
    *,
    definition: dict[str, Any],
) -> None:
    value_positions = {
        key: {_param_lookup_key(value): index for index, value in enumerate(values)}
        for key, values in definition["parameter_values"].items()
    }
    row_by_combo = {str(row["combo_key"]): row for row in rows}
    parameter_keys = ["thread_count", "stop_sessions", "buy_pct", "sell_pct"]

    for row in rows:
        param_positions = {
            key: value_positions[key][_param_lookup_key(row["params"][key])]
            for key in parameter_keys
        }
        neighbor_rows: list[dict[str, Any]] = []
        for thread_offset in (-1, 0, 1):
            for stop_offset in (-1, 0, 1):
                for buy_offset in (-1, 0, 1):
                    for sell_offset in (-1, 0, 1):
                        if thread_offset == 0 and stop_offset == 0 and buy_offset == 0 and sell_offset == 0:
                            continue
                        candidate_offsets = {
                            "thread_count": thread_offset,
                            "stop_sessions": stop_offset,
                            "buy_pct": buy_offset,
                            "sell_pct": sell_offset,
                        }
                        candidate_values: dict[str, Any] = {}
                        valid = True
                        for key in parameter_keys:
                            values = definition["parameter_values"][key]
                            next_index = param_positions[key] + candidate_offsets[key]
                            if next_index < 0 or next_index >= len(values):
                                valid = False
                                break
                            candidate_values[key] = values[next_index]
                        if not valid:
                            continue
                        candidate_key = _combo_key(candidate_values)
                        neighbor_row = row_by_combo.get(candidate_key)
                        if neighbor_row is not None:
                            neighbor_rows.append(neighbor_row)
        neighbor_count = len(neighbor_rows)
        row["plateau_details"] = {
            "neighbor_count": neighbor_count,
            "neighbor_pass_ratio_pct": 0.0,
            "neighbor_mean_cagr_pct": 0.0,
        }
        if neighbor_count < 4:
            row["plateau_class"] = "E"
            continue
        robust_neighbors = sum(1 for neighbor in neighbor_rows if neighbor["tier_pass"])
        pass_ratio = Decimal(robust_neighbors) / Decimal(neighbor_count)
        neighbor_mean_cagr = mean_decimal([Decimal(str(neighbor["metrics"]["mean_cagr_pct"])) for neighbor in neighbor_rows])
        target_mean_cagr = Decimal(str(row["metrics"]["mean_cagr_pct"]))
        row["plateau_details"] = {
            "neighbor_count": neighbor_count,
            "neighbor_pass_ratio_pct": as_number(pass_ratio * D("100")),
            "neighbor_mean_cagr_pct": as_number(neighbor_mean_cagr),
        }
        if pass_ratio >= D("0.8") and neighbor_mean_cagr >= target_mean_cagr * D("0.7"):
            row["plateau_class"] = "P"
        elif neighbor_mean_cagr < target_mean_cagr * D("0.5"):
            row["plateau_class"] = "I"
        else:
            row["plateau_class"] = "M"


def _parameter_sweep_chunk_rows(
    params_chunk: list[dict[str, Any]],
    *,
    bars: list[MarketBar],
    base_config: StrategyConfig,
    data_hash: str,
    fixed_values: dict[str, Any],
    execution_model: str,
    price_basis: str,
    segment_presets: list[dict[str, Any]],
    evaluation_windows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for params in params_chunk:
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
        window_rows = _window_rows_from_daily(run.daily, evaluation_windows)
        window_cagrs = [Decimal(str(window["cagr_pct"])) for window in window_rows]
        recent_window_slice = _recent_slice_from_windows(run.daily, window_rows)
        compound_ratio = D("1")
        for window in window_rows:
            compound_ratio *= Decimal(str(window["growth_ratio"]))
        compound_ratio_log10 = D(str(log10(float(compound_ratio)))) if compound_ratio > ZERO else D("-12")
        rows.append(
            {
                "combo_key": config.profile_id,
                "config_hash": config.config_hash(),
                "params": {
                    "thread_count": int(params["thread_count"]),
                    "stop_sessions": int(params["stop_sessions"]),
                    "buy_pct": as_number(D(params["buy_pct"])),
                    "sell_pct": as_number(D(params["sell_pct"])),
                },
                "metrics": {
                    "full_return_pct": as_number(run.metrics["total_return_pct"]),
                    "cagr_pct": as_number(run.metrics["cagr_pct"]),
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
                    "mean_cagr_pct": as_number(mean_decimal(window_cagrs)),
                    "std_cagr_pct": as_number(stddev_decimal(window_cagrs)),
                    "worst_window_cagr_pct": as_number(min(window_cagrs, default=ZERO)),
                    "recent_cagr_pct": recent_window_slice["cagr_pct"] if recent_window_slice else 0.0,
                    "recent_mdd_pct": recent_window_slice["max_drawdown_pct"] if recent_window_slice else 0.0,
                    "compound_ratio": _as_precise_number(compound_ratio),
                    "compound_ratio_log10": _as_precise_number(compound_ratio_log10),
                },
                "yearly_returns_pct": {
                    str(year): as_number(payload["return_pct"])
                    for year, payload in run.yearly.items()
                },
                "segment_returns_pct": {
                    segment["segment_id"]: as_number(D(segment["return_pct"]))
                    for segment in segment_rows
                },
                "windows": window_rows,
                "recent_window": recent_window_slice,
                "_trade_returns": [as_number(trade.return_pct) for trade in run.trades],
            }
        )
    return rows


def _parameter_sweep_meta(
    *,
    base_config: StrategyConfig,
    definition: dict[str, Any],
    plan: SweepExecutionPlan,
    period_start: date,
    period_end: date,
    data_hash: str,
    code_commit: str,
    execution_model: str,
    price_basis: str,
    segment_presets: list[dict[str, Any]],
    evaluation_windows: list[dict[str, Any]],
    baseline_row: dict[str, Any] | None = None,
    baseline_mean_cagr_pct: Decimal = ZERO,
    baseline_std_cagr_pct: Decimal = ZERO,
) -> dict[str, Any]:
    return {
        "sweep_id": plan.sweep_id,
        "sweep_hash": sweep_hash(definition),
        "strategy_family": plan.strategy_family,
        "sweep_spec_version": plan.spec_version,
        "symbol": base_config.symbol,
        "initial_capital": str(base_config.initial_capital),
        "execution_model": execution_model,
        "price_basis": price_basis,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data_hash": data_hash,
        "code_commit": code_commit,
        "combo_count": plan.combo_count,
        "worker_count": plan.max_workers,
        "chunk_count": plan.chunk_count,
        "chunk_size": plan.chunk_size,
        "segment_presets": segment_presets,
        "parameter_values": definition["parameter_values"],
        "evaluation_windows": evaluation_windows,
        "recent_window_span": RECENT_WINDOW_SPAN,
        "baseline_thresholds": {
            "combo_key": baseline_row["combo_key"] if baseline_row else None,
            "mean_cagr_pct": as_number(baseline_mean_cagr_pct),
            "std_cagr_pct": as_number(baseline_std_cagr_pct),
            "std_cagr_limit_pct": as_number(baseline_std_cagr_pct * D("1.2")) if baseline_row else 0.0,
        },
        "plateau_rule": {
            "edge_neighbor_min": 4,
            "plateau_neighbor_pass_ratio_min_pct": 80.0,
            "plateau_neighbor_mean_cagr_ratio_min_pct": 70.0,
            "island_neighbor_mean_cagr_ratio_max_pct": 50.0,
        },
        "tier_rule": {
            "tier_1_min_trade_return_pct_gt": -100.0,
            "tier_2_all_windows_positive": True,
            "tier_3_mean_cagr_gt_baseline": True,
            "tier_4_std_cagr_lt_baseline_x": 1.2,
        },
        "compound_ratio_definition": "PRODUCT(ending_balance / starting_balance) across trailing yearly evaluation windows",
    }


def describe_parameter_sweep_execution(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION,
    sweep_id: str = PARAMETER_SWEEP_ID,
    execution_model: str = "next_open",
    price_basis: str = "adjusted_close",
    max_workers: int = 0,
    chunk_size: int = 0,
) -> dict[str, Any]:
    period_start = bars[0].session_date
    period_end = bars[-1].session_date
    code_commit = current_code_commit()
    segment_presets = build_macro_segment_presets(period_start, period_end)
    evaluation_windows = build_yearly_evaluation_windows(
        period_start,
        period_end,
        max_windows=EVALUATION_WINDOW_MAX_COUNT,
    )
    plan, _ = _resolve_sweep_execution_plan(
        definition,
        sweep_id=sweep_id,
        max_workers=max_workers,
        chunk_size=chunk_size,
    )
    meta = _parameter_sweep_meta(
        base_config=base_config,
        definition=definition,
        plan=plan,
        period_start=period_start,
        period_end=period_end,
        data_hash=data_hash,
        code_commit=code_commit,
        execution_model=execution_model,
        price_basis=price_basis,
        segment_presets=segment_presets,
        evaluation_windows=evaluation_windows,
    )
    return {
        "meta": meta,
        "plan": {
            "requested_max_workers": plan.requested_max_workers,
            "max_workers": plan.max_workers,
            "chunk_size": plan.chunk_size,
            "chunk_count": plan.chunk_count,
            "combo_count": plan.combo_count,
            "parameter_keys": list(plan.parameter_keys),
        },
    }


def build_parameter_sweep(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION,
    sweep_id: str = PARAMETER_SWEEP_ID,
    execution_model: str = "next_open",
    price_basis: str = "adjusted_close",
    max_workers: int = 0,
    chunk_size: int = 0,
) -> dict[str, Any]:
    period_start = bars[0].session_date
    period_end = bars[-1].session_date
    code_commit = current_code_commit()
    segment_presets = build_macro_segment_presets(period_start, period_end)
    evaluation_windows = build_yearly_evaluation_windows(
        period_start,
        period_end,
        max_windows=EVALUATION_WINDOW_MAX_COUNT,
    )
    plan, chunks = _resolve_sweep_execution_plan(
        definition,
        sweep_id=sweep_id,
        max_workers=max_workers,
        chunk_size=chunk_size,
    )
    rows = execute_sweep_chunks(
        chunks,
        worker_fn=_parameter_sweep_chunk_rows,
        worker_kwargs={
            "bars": bars,
            "base_config": base_config,
            "data_hash": data_hash,
            "fixed_values": definition.get("fixed_values", {}),
            "execution_model": execution_model,
            "price_basis": price_basis,
            "segment_presets": segment_presets,
            "evaluation_windows": evaluation_windows,
        },
        max_workers=plan.max_workers,
    )

    baseline_row = _select_baseline_row(rows)
    baseline_mean_cagr_pct = Decimal(str(baseline_row["metrics"]["mean_cagr_pct"])) if baseline_row else ZERO
    baseline_std_cagr_pct = Decimal(str(baseline_row["metrics"]["std_cagr_pct"])) if baseline_row else ZERO
    _assign_tier_flags(
        rows,
        baseline_mean_cagr_pct=baseline_mean_cagr_pct,
        baseline_std_cagr_pct=baseline_std_cagr_pct,
    )
    _assign_plateau_classes(rows, definition=definition)

    pareto_return_mdd = _pareto_flags(
        rows,
        left_key="metrics.mean_cagr_pct",
        right_key="metrics.max_drawdown_pct",
        right_higher_is_better=True,
    )
    pareto_return_stability = _pareto_flags(
        rows,
        left_key="metrics.mean_cagr_pct",
        right_key="metrics.std_cagr_pct",
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
            -D(str(row["metrics"]["cagr_pct"])),
            -D(str(row["metrics"]["max_drawdown_pct"])),
            -D(str(row["metrics"]["full_return_pct"])),
            str(row["combo_key"]),
        ),
    )
    best_full = max(rows, key=lambda row: D(str(row["metrics"]["full_return_pct"])))
    best_robust = ranked_rows[0]
    best_compound = max(rows, key=lambda row: D(str(row["metrics"]["compound_ratio"])))
    warnings: list[str] = []
    if D(str(best_full["metrics"]["max_drawdown_pct"])) < D("-60"):
        warnings.append(
            f"최고 전체수익 조합 {best_full['combo_key']} 는 MDD가 {best_full['metrics']['max_drawdown_pct']}% 입니다."
        )
    if D(str(best_robust["metrics"]["cagr_pct"])) < D("0"):
        warnings.append(
            f"CAGR 기준 상위 조합 {best_robust['combo_key']} 는 연환산 수익률이 {best_robust['metrics']['cagr_pct']}% 입니다."
        )

    return {
        "meta": _parameter_sweep_meta(
            base_config=base_config,
            definition=definition,
            plan=plan,
            period_start=period_start,
            period_end=period_end,
            data_hash=data_hash,
            code_commit=code_commit,
            execution_model=execution_model,
            price_basis=price_basis,
            segment_presets=segment_presets,
            evaluation_windows=evaluation_windows,
            baseline_row=baseline_row,
            baseline_mean_cagr_pct=baseline_mean_cagr_pct,
            baseline_std_cagr_pct=baseline_std_cagr_pct,
        ),
        "summary": {
            "best_full_return_combo": best_full["combo_key"],
            "best_robust_combo": best_robust["combo_key"],
            "best_compound_ratio_combo": best_compound["combo_key"],
            "pareto_return_mdd_count": len(pareto_return_mdd),
            "pareto_return_stability_count": len(pareto_return_stability),
            "plateau_counts": {
                "P": sum(1 for row in rows if row["plateau_class"] == "P"),
                "M": sum(1 for row in rows if row["plateau_class"] == "M"),
                "I": sum(1 for row in rows if row["plateau_class"] == "I"),
                "E": sum(1 for row in rows if row["plateau_class"] == "E"),
            },
            "tier_pass_count": sum(1 for row in rows if row["tier_pass"]),
            "recent_safe_count": sum(1 for row in rows if D(str(row["metrics"]["recent_mdd_pct"])) >= D("-45")),
            "recent_extreme_safe_count": sum(1 for row in rows if D(str(row["metrics"]["recent_mdd_pct"])) >= D("-35")),
            "ranking_basis": "cagr desc, max_drawdown desc, full_return desc",
        },
        "warnings": warnings,
        "rows": ranked_rows,
        "payload_hash": stable_hash({"sweep_id": sweep_id, "rows": ranked_rows, "evaluation_windows": evaluation_windows}),
    }
