from __future__ import annotations

from dataclasses import replace
from typing import Any

from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D
from .research_common import CORE_PROFILE_CATALOG, CORE_PROFILE_CATALOG_ID, as_number, mean_decimal, stddev_decimal
from .strategy_explorer import build_strategy_explorer

OFFICIAL_PROFILE_ID = "ddeolsao_pal_official_v1"
OFFICIAL_SELECTION_BASIS = "mean_segment_return desc, segment_stddev asc, full_return desc"


def build_official_explorer(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    catalog: tuple[dict[str, Any], ...] = CORE_PROFILE_CATALOG,
    catalog_id: str = CORE_PROFILE_CATALOG_ID,
) -> dict[str, Any]:
    explorer = build_strategy_explorer(
        bars,
        base_config,
        data_hash=data_hash,
        catalog=catalog,
        catalog_id=catalog_id,
        execution_model=base_config.execution_model.value,
        price_basis=base_config.price_basis.value,
    )
    rankings = _rankings_from_explorer(explorer)
    official_combo_key = _combo_key(base_config.thread_count, base_config.stop_sessions)
    official_profile = next((row for row in rankings if row["combo_key"] == official_combo_key), None)
    current_top = rankings[0] if rankings else None
    return {
        "meta": {
            "catalog_id": catalog_id,
            "symbol": base_config.symbol,
            "initial_capital": str(base_config.initial_capital),
            "price_basis": base_config.price_basis.value,
            "execution_model": base_config.execution_model.value,
            "period_start": bars[0].session_date.isoformat(),
            "period_end": bars[-1].session_date.isoformat(),
            "data_hash": data_hash,
            "code_commit": "workspace",
            "selection_basis": OFFICIAL_SELECTION_BASIS,
            "official_profile_id": base_config.profile_id,
            "official_combo_key": official_combo_key,
        },
        "official_profile": {
            "profile_id": base_config.profile_id,
            "combo_key": official_combo_key,
            "thread_count": base_config.thread_count,
            "stop_sessions": base_config.stop_sessions,
            "config_hash": base_config.config_hash(),
        },
        "current_catalog_top": current_top,
        "matches_current_catalog_top": bool(current_top and current_top["combo_key"] == official_combo_key),
        "rankings": rankings,
    }


def _combo_key(thread_count: int, stop_sessions: int) -> str:
    return f"{thread_count}x{stop_sessions}"


def _rankings_from_explorer(explorer: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for strategy in explorer["strategies"]:
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
                "combo_key": _combo_key(int(strategy["thread_count"]), int(strategy["stop_sessions"])),
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
