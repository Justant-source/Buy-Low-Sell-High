from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from datetime import date
from itertools import repeat
import math
import os
from typing import Any

from ..backtest.engine import run_backtest
from ..backtest.regime import ResolvedRegimeContext, load_regime_context, regime_feature_enabled
from ..code_version import current_code_commit
from ..domain.enums import PriceBasis
from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D, ZERO
from .research_common import (
    CORE_PROFILE_CATALOG,
    CORE_PROFILE_CATALOG_ID,
    PARAMETER_SWEEP_DEFINITION,
    as_number,
    benchmark_daily_from_bars,
    build_macro_segment_presets,
    build_slice_presets,
    catalog_hash,
    mean_decimal,
    monthly_summary_from_daily,
    segment_rows_from_daily,
    serialize_daily,
    serialize_metric_dict,
    summarize_daily_slice,
    stddev_decimal,
)
from .strategy_specs import build_strategy_config, format_strategy_label, iter_parameter_strategy_specs, iter_regime_strategy_specs, resolve_strategy_spec

STRATEGY_RANKING_BASIS = "mean_segment_return desc, segment_stddev asc, full_return desc"
SLICE_RANKING_BASIS = "cagr desc, max_drawdown desc, full_return desc, combo_key asc"


def combo_key(thread_count: int, stop_sessions: int) -> str:
    return f"{thread_count}x{stop_sessions}"


def build_strategy_rankings(strategies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for strategy in strategies:
        segment_returns = [D(str(segment["return_pct"])) for segment in strategy["segments"]]
        mean_segment_return = mean_decimal(segment_returns)
        segment_stddev = stddev_decimal(segment_returns)
        full_return = D(str(strategy["metrics"]["total_return_pct"]))
        worst_segment_return = min(segment_returns, default=D("0"))
        recent_segment_return = segment_returns[-1] if segment_returns else D("0")
        positive_ratio = 0.0
        if segment_returns:
            positive_ratio = round((sum(1 for value in segment_returns if value > D("0")) / len(segment_returns)) * 100, 2)
        rows.append(
            {
                "combo_key": strategy["strategy_id"] if strategy.get("regime_enabled") else combo_key(int(strategy["thread_count"]), int(strategy["stop_sessions"])),
                "strategy_id": strategy["strategy_id"],
                "label": strategy["label"],
                "thread_count": int(strategy["thread_count"]),
                "stop_sessions": int(strategy["stop_sessions"]),
                "full_return_pct": as_number(full_return),
                "mean_segment_return_pct": as_number(mean_segment_return),
                "segment_stddev_pct": as_number(segment_stddev),
                "worst_segment_return_pct": as_number(worst_segment_return),
                "positive_segment_ratio_pct": positive_ratio,
                "recent_segment_return_pct": as_number(recent_segment_return),
                "regime_enabled": bool(strategy.get("regime_enabled", False)),
            }
        )
    rows.sort(
        key=lambda row: (
            -D(str(row["mean_segment_return_pct"])),
            D(str(row["segment_stddev_pct"])),
            -D(str(row["full_return_pct"])),
            str(row["combo_key"]),
        )
    )
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return rows


def filter_bars_to_slice(bars: list[MarketBar], *, slice_start: date | None = None, slice_end: date | None = None) -> list[MarketBar]:
    start = slice_start or bars[0].session_date
    end = slice_end or bars[-1].session_date
    return [bar for bar in bars if start <= bar.session_date <= end]


def _strategy_payload_from_run(
    strategy_spec: dict[str, Any],
    run: Any,
    *,
    data_hash: str,
    execution_model: str,
    price_basis: str,
) -> dict[str, Any]:
    period_start = run.daily[0].session_date.isoformat() if run.daily else ""
    period_end = run.daily[-1].session_date.isoformat() if run.daily else ""
    payload = {
        "strategy_id": strategy_spec["strategy_id"],
        "label": strategy_spec["label"],
        "thread_count": strategy_spec["thread_count"],
        "stop_sessions": strategy_spec.get("stop_sessions", run.config.stop_sessions),
        "buy_pct": as_number(D(strategy_spec.get("buy_pct", 0))),
        "sell_pct": as_number(D(strategy_spec.get("sell_pct", 0))),
        "mentor_profiles": list(strategy_spec.get("mentor_profiles", [])),
        "config_hash": run.config.config_hash(),
        "meta": {
            "strategy_id": strategy_spec["strategy_id"],
            "symbol": run.config.symbol,
            "initial_capital": str(run.config.initial_capital),
            "price_basis": price_basis,
            "execution_model": execution_model,
            "period_start": period_start,
            "period_end": period_end,
            "data_hash": data_hash,
            "config_hash": run.config.config_hash(),
            "code_commit": run.code_commit,
            "regime_enabled": run.config.regime_enabled,
            "regime_symbol": run.config.regime_symbol,
            "regime_data_hash": run.regime_data_hash,
            "regime_config_hash": run.regime_config_hash,
        },
        "metrics": serialize_metric_dict(run.metrics),
        "yearly": {
            str(year): serialize_metric_dict(payload)
            for year, payload in run.yearly.items()
        },
        "monthly": monthly_summary_from_daily(run.daily),
        "segments": [],
        "daily": serialize_daily(run.daily),
    }
    if strategy_spec.get("regime_enabled"):
        payload.update(
            {
                "bull_stop_sessions": int(strategy_spec["bull_stop_sessions"]),
                "bull_buy_pct": as_number(D(strategy_spec["bull_buy_pct"])),
                "bull_sell_pct": as_number(D(strategy_spec["bull_sell_pct"])),
                "bear_stop_sessions": int(strategy_spec["bear_stop_sessions"]),
                "bear_buy_pct": as_number(D(strategy_spec["bear_buy_pct"])),
                "bear_sell_pct": as_number(D(strategy_spec["bear_sell_pct"])),
                "regime_enabled": True,
            }
        )
    else:
        payload["regime_enabled"] = run.config.regime_enabled
    return payload


def build_strategy_detail(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    strategy_id: str,
    data_hash: str = "adhoc",
    execution_model: str = "next_open",
    price_basis: str = "adjusted_close",
) -> dict[str, Any]:
    strategy_spec = resolve_strategy_spec(strategy_id)
    regime_context = load_regime_context(bars, base_config)
    config = build_strategy_config(
        base_config,
        strategy_spec,
        execution_model=execution_model,
        price_basis=price_basis,
    )
    run = run_backtest(bars, config, data_hash=data_hash, regime_context=regime_context)
    payload = _strategy_payload_from_run(
        strategy_spec,
        run,
        data_hash=data_hash,
        execution_model=execution_model,
        price_basis=price_basis,
    )
    payload["segments"] = segment_rows_from_daily(run.daily, build_macro_segment_presets(bars[0].session_date, bars[-1].session_date))
    payload["display_params"] = format_strategy_label(strategy_spec)
    return payload


def _slice_ranking_row(
    strategy_spec: dict[str, Any],
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str,
    execution_model: str,
    price_basis: str,
    segment_presets: list[dict[str, str]],
    regime_context: ResolvedRegimeContext,
) -> dict[str, Any]:
    config = build_strategy_config(
        base_config,
        strategy_spec,
        execution_model=execution_model,
        price_basis=price_basis,
    )
    run = run_backtest(bars, config, data_hash=data_hash, regime_context=regime_context)
    full_return = D(str(run.metrics["total_return_pct"]))
    row = {
        "combo_key": strategy_spec["strategy_id"],
        "strategy_id": strategy_spec["strategy_id"],
        "label": strategy_spec["label"],
        "display_params": format_strategy_label(strategy_spec),
        "thread_count": int(strategy_spec["thread_count"]),
        "stop_sessions": int(strategy_spec.get("stop_sessions", run.config.stop_sessions)),
        "buy_pct": as_number(D(strategy_spec.get("buy_pct", 0))),
        "sell_pct": as_number(D(strategy_spec.get("sell_pct", 0))),
        "full_return_pct": as_number(full_return),
        "cagr_pct": as_number(D(str(run.metrics["cagr_pct"]))),
        "max_drawdown_pct": as_number(D(str(run.metrics["max_drawdown_pct"]))),
        "trade_count": int(run.metrics["trade_count"]),
        "regime_enabled": run.config.regime_enabled,
    }
    if strategy_spec.get("regime_enabled"):
        row.update(
            {
                "bull_stop_sessions": int(strategy_spec["bull_stop_sessions"]),
                "bull_buy_pct": as_number(D(strategy_spec["bull_buy_pct"])),
                "bull_sell_pct": as_number(D(strategy_spec["bull_sell_pct"])),
                "bear_stop_sessions": int(strategy_spec["bear_stop_sessions"]),
                "bear_buy_pct": as_number(D(strategy_spec["bear_buy_pct"])),
                "bear_sell_pct": as_number(D(strategy_spec["bear_sell_pct"])),
            }
        )
    return row


def _slice_ranking_worker(
    strategy_specs: list[dict[str, Any]],
    bars: list[MarketBar],
    base_config: StrategyConfig,
    data_hash: str,
    execution_model: str,
    price_basis: str,
    segment_presets: list[dict[str, str]],
    regime_context: ResolvedRegimeContext,
) -> list[dict[str, Any]]:
    return [
        _slice_ranking_row(
            strategy_spec,
            bars,
            base_config,
            data_hash=data_hash,
            execution_model=execution_model,
            price_basis=price_basis,
            segment_presets=segment_presets,
            regime_context=regime_context,
        )
        for strategy_spec in strategy_specs
    ]


def _chunk_strategy_specs(strategy_specs: list[dict[str, Any]], chunk_count: int) -> list[list[dict[str, Any]]]:
    chunk_size = max(1, math.ceil(len(strategy_specs) / chunk_count))
    return [strategy_specs[index:index + chunk_size] for index in range(0, len(strategy_specs), chunk_size)]


def _resolve_strategy_ranking_workers(max_workers: int, combo_count: int) -> int:
    if combo_count <= 1:
        return 1
    cpu_count = os.cpu_count() or 1
    return max(1, min(int(max_workers), cpu_count, combo_count))


def build_slice_strategy_rankings(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    execution_model: str = "next_open",
    price_basis: str = "adjusted_close",
    limit: int = 10,
    max_workers: int = 1,
    executor: Any | None = None,
) -> dict[str, Any]:
    period_start = bars[0].session_date
    period_end = bars[-1].session_date
    code_commit = current_code_commit()
    segment_presets = build_macro_segment_presets(period_start, period_end)
    strategy_specs = (
        iter_regime_strategy_specs(base_config)
        if regime_feature_enabled(base_config)
        else iter_parameter_strategy_specs(PARAMETER_SWEEP_DEFINITION)
    )
    regime_context = load_regime_context(bars, base_config)
    resolved_workers = _resolve_strategy_ranking_workers(max_workers, len(strategy_specs))

    if resolved_workers == 1:
        rows = [
            _slice_ranking_row(
                strategy_spec,
                bars,
                base_config,
                data_hash=data_hash,
                execution_model=execution_model,
                price_basis=price_basis,
                segment_presets=segment_presets,
                regime_context=regime_context,
            )
            for strategy_spec in strategy_specs
        ]
    else:
        chunks = _chunk_strategy_specs(strategy_specs, resolved_workers)
        if executor is None:
            with ProcessPoolExecutor(max_workers=resolved_workers) as process_pool:
                partial_rows = process_pool.map(
                    _slice_ranking_worker,
                    chunks,
                    repeat(bars),
                    repeat(base_config),
                    repeat(data_hash),
                    repeat(execution_model),
                    repeat(price_basis),
                    repeat(segment_presets),
                    repeat(regime_context),
                )
                rows = [row for group in partial_rows for row in group]
        else:
            partial_rows = executor.map(
                _slice_ranking_worker,
                chunks,
                repeat(bars),
                repeat(base_config),
                repeat(data_hash),
                repeat(execution_model),
                repeat(price_basis),
                repeat(segment_presets),
                repeat(regime_context),
            )
            rows = [row for group in partial_rows for row in group]

    rows.sort(
        key=lambda row: (
            -D(str(row["cagr_pct"])),
            -D(str(row["max_drawdown_pct"])),
            -D(str(row["full_return_pct"])),
            str(row["combo_key"]),
        )
    )
    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    return {
        "meta": {
            "symbol": base_config.symbol,
            "initial_capital": str(base_config.initial_capital),
            "price_basis": price_basis,
            "execution_model": execution_model,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "data_hash": data_hash,
            "code_commit": code_commit,
            "ranking_basis": SLICE_RANKING_BASIS,
            "segment_presets": segment_presets,
            "combo_count": len(rows),
            "regime_enabled": regime_feature_enabled(base_config),
            "regime_symbol": base_config.regime_symbol if regime_feature_enabled(base_config) else None,
            "regime_data_hash": regime_context.data_hash,
            "regime_config_hash": regime_context.config_hash,
        },
        "rows": rows[:limit] if limit > 0 else rows,
    }


def build_strategy_explorer(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    catalog: tuple[dict[str, Any], ...] = CORE_PROFILE_CATALOG,
    catalog_id: str = CORE_PROFILE_CATALOG_ID,
    execution_model: str = "next_open",
    price_basis: str = "adjusted_close",
) -> dict[str, Any]:
    period_start = bars[0].session_date
    period_end = bars[-1].session_date
    code_commit = current_code_commit()
    slice_presets = build_slice_presets(period_start, period_end)
    macro_presets = build_macro_segment_presets(period_start, period_end)
    regime_context = load_regime_context(bars, base_config)
    resolved_price_basis = PriceBasis(price_basis)
    benchmark_daily = benchmark_daily_from_bars(
        bars,
        initial_capital=base_config.initial_capital,
        price_basis=resolved_price_basis,
    )
    benchmark_summary = summarize_daily_slice(benchmark_daily)

    strategies: list[dict[str, Any]] = []
    for strategy_row in catalog:
        config = build_strategy_config(
            base_config,
            strategy_row,
            execution_model=execution_model,
            price_basis=price_basis,
        )
        run = run_backtest(bars, config, data_hash=data_hash, regime_context=regime_context)
        payload = _strategy_payload_from_run(
            {
                **strategy_row,
                "buy_pct": D("0"),
                "sell_pct": D("0"),
            },
            run,
            data_hash=data_hash,
            execution_model=execution_model,
            price_basis=price_basis,
        )
        payload["segments"] = segment_rows_from_daily(run.daily, macro_presets)
        strategies.append(payload)
    rankings = build_strategy_rankings(strategies)

    return {
        "meta": {
            "catalog_id": catalog_id,
            "catalog_hash": catalog_hash(catalog),
            "symbol": base_config.symbol,
            "initial_capital": str(base_config.initial_capital),
            "price_basis": price_basis,
            "execution_model": execution_model,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "data_hash": data_hash,
            "code_commit": code_commit,
            "ranking_basis": STRATEGY_RANKING_BASIS,
            "slice_presets": slice_presets,
            "segment_presets": macro_presets,
            "regime_enabled": regime_feature_enabled(base_config),
            "regime_symbol": base_config.regime_symbol if regime_feature_enabled(base_config) else None,
            "regime_data_hash": regime_context.data_hash,
            "regime_config_hash": regime_context.config_hash,
        },
        "benchmark": {
            "strategy_id": "buy_hold",
            "label": "Buy & Hold",
            "combo_key": "Buy & Hold",
            "metrics": serialize_metric_dict(
                {
                    "total_return_pct": D(str(benchmark_summary["return_pct"])) if benchmark_summary else ZERO,
                    "max_drawdown_pct": D(str(benchmark_summary["max_drawdown_pct"])) if benchmark_summary else ZERO,
                    "volatility_pct": ZERO,
                    "trade_count": 0,
                    "take_profit_count": 0,
                    "time_stop_count": 0,
                }
            ),
            "monthly": monthly_summary_from_daily(benchmark_daily),
            "segments": segment_rows_from_daily(benchmark_daily, macro_presets),
            "daily": serialize_daily(benchmark_daily),
        },
        "strategies": strategies,
        "rankings": rankings,
    }
