from __future__ import annotations

from dataclasses import replace
from typing import Any

from ..code_version import current_code_commit
from ..domain.models import MarketBar, StrategyConfig
from .research_common import CORE_PROFILE_CATALOG, CORE_PROFILE_CATALOG_ID
from .strategy_explorer import STRATEGY_RANKING_BASIS, build_strategy_explorer, combo_key

OFFICIAL_PROFILE_ID = "soxl_official_ddeolsao_pal_v1"


def build_official_explorer(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    catalog: tuple[dict[str, Any], ...] = CORE_PROFILE_CATALOG,
    catalog_id: str = CORE_PROFILE_CATALOG_ID,
) -> dict[str, Any]:
    code_commit = current_code_commit()
    explorer = build_strategy_explorer(
        bars,
        base_config,
        data_hash=data_hash,
        catalog=catalog,
        catalog_id=catalog_id,
        execution_model=base_config.execution_model.value,
        price_basis=base_config.price_basis.value,
    )
    rankings = explorer["rankings"]
    official_combo_key = combo_key(base_config.thread_count, base_config.stop_sessions)
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
            "code_commit": code_commit,
            "selection_basis": STRATEGY_RANKING_BASIS,
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
