from __future__ import annotations

from dataclasses import replace
from typing import Any

from ..backtest.engine import run_backtest
from ..domain.enums import ExecutionModel, PriceBasis, SizingMode
from ..domain.models import MarketBar, StrategyConfig
from .research_common import (
    CORE_PROFILE_CATALOG,
    CORE_PROFILE_CATALOG_ID,
    build_macro_segment_presets,
    build_slice_presets,
    catalog_hash,
    monthly_summary_from_daily,
    segment_rows_from_daily,
    serialize_daily,
    serialize_metric_dict,
)


def _catalog_strategy_config(
    base_config: StrategyConfig,
    strategy_row: dict[str, Any],
    *,
    execution_model: str,
    price_basis: str,
) -> StrategyConfig:
    return replace(
        base_config,
        thread_count=int(strategy_row["thread_count"]),
        stop_sessions=int(strategy_row["stop_sessions"]),
        execution_model=ExecutionModel(execution_model),
        price_basis=PriceBasis(price_basis),
        sizing_mode=SizingMode.FIXED_PRINCIPAL,
        profile_id=str(strategy_row["strategy_id"]),
    )


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
    slice_presets = build_slice_presets(period_start, period_end)
    macro_presets = build_macro_segment_presets(period_start, period_end)

    strategies: list[dict[str, Any]] = []
    for strategy_row in catalog:
        config = _catalog_strategy_config(
            base_config,
            strategy_row,
            execution_model=execution_model,
            price_basis=price_basis,
        )
        run = run_backtest(bars, config, data_hash=data_hash)
        strategies.append(
            {
                "strategy_id": strategy_row["strategy_id"],
                "label": strategy_row["label"],
                "thread_count": strategy_row["thread_count"],
                "stop_sessions": strategy_row["stop_sessions"],
                "mentor_profiles": list(strategy_row["mentor_profiles"]),
                "config_hash": config.config_hash(),
                "metrics": serialize_metric_dict(run.metrics),
                "yearly": {
                    str(year): serialize_metric_dict(payload)
                    for year, payload in run.yearly.items()
                },
                "monthly": monthly_summary_from_daily(run.daily),
                "segments": segment_rows_from_daily(run.daily, macro_presets),
                "daily": serialize_daily(run.daily),
            }
        )

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
            "code_commit": "workspace",
            "slice_presets": slice_presets,
            "segment_presets": macro_presets,
        },
        "strategies": strategies,
    }
