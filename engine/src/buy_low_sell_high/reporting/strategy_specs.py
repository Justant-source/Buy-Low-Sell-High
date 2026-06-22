from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
import re
from typing import Any

from ..backtest.regime import regime_feature_enabled
from ..domain.enums import ExecutionModel, PriceBasis, SizingMode, ThreadSelector
from ..domain.models import StrategyConfig
from ..domain.money import D
from .research_common import CORE_PROFILE_CATALOG, PARAMETER_SWEEP_DEFINITION

_DYNAMIC_STRATEGY_ID_RE = re.compile(
    r"^t(?P<thread_count>\d+)-s(?P<stop_sessions>\d+)-buy(?P<buy_pct>[+-]?\d+(?:\.\d+)?)"
    r"-sell(?P<sell_pct>[+-]?\d+(?:\.\d+)?)$"
)
_REGIME_STRATEGY_ID_RE = re.compile(
    r"^rt(?P<thread_count>\d+)-bst(?P<bull_stop_sessions>\d+)-bbuy(?P<bull_buy_pct>[+-]?\d+(?:\.\d+)?)"
    r"-bsell(?P<bull_sell_pct>[+-]?\d+(?:\.\d+)?)-rst(?P<bear_stop_sessions>\d+)"
    r"-rbuy(?P<bear_buy_pct>[+-]?\d+(?:\.\d+)?)-rsell(?P<bear_sell_pct>[+-]?\d+(?:\.\d+)?)$"
)


def dynamic_strategy_id(thread_count: int, stop_sessions: int, buy_pct: int | float | Decimal, sell_pct: int | float | Decimal) -> str:
    buy_value = Decimal(str(buy_pct))
    sell_value = Decimal(str(sell_pct))
    return f"t{thread_count}-s{stop_sessions}-buy{buy_value:+.0f}-sell{sell_value:+.0f}"


def regime_strategy_id(
    thread_count: int,
    bull_stop_sessions: int,
    bull_buy_pct: int | float | Decimal,
    bull_sell_pct: int | float | Decimal,
    bear_stop_sessions: int,
    bear_buy_pct: int | float | Decimal,
    bear_sell_pct: int | float | Decimal,
) -> str:
    return (
        f"rt{thread_count}"
        f"-bst{int(bull_stop_sessions)}-bbuy{Decimal(str(bull_buy_pct)):+.0f}-bsell{Decimal(str(bull_sell_pct)):+.0f}"
        f"-rst{int(bear_stop_sessions)}-rbuy{Decimal(str(bear_buy_pct)):+.0f}-rsell{Decimal(str(bear_sell_pct)):+.0f}"
    )


def format_strategy_label(spec: dict[str, Any]) -> str:
    if spec.get("regime_enabled"):
        return (
            f"T{spec['thread_count']} | "
            f"Bull {spec['bull_stop_sessions']}S / BUY {Decimal(str(spec['bull_buy_pct'])):+.0f}% / SELL {Decimal(str(spec['bull_sell_pct'])):+.0f}% | "
            f"Bear {spec['bear_stop_sessions']}S / BUY {Decimal(str(spec['bear_buy_pct'])):+.0f}% / SELL {Decimal(str(spec['bear_sell_pct'])):+.0f}%"
        )
    buy_pct = Decimal(str(spec.get("buy_pct", 0)))
    sell_pct = Decimal(str(spec.get("sell_pct", 0)))
    return f"T{spec['thread_count']} / {spec['stop_sessions']}S / BUY {buy_pct:+.0f}% / SELL {sell_pct:+.0f}%"


def _is_supported_dynamic_parameter(
    field_name: str,
    value: int | Decimal,
    *,
    definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION,
) -> bool:
    allowed_values = definition["parameter_values"][field_name]
    if isinstance(value, Decimal):
        return value in {Decimal(str(item)) for item in allowed_values}
    return int(value) in {int(item) for item in allowed_values}


def parse_dynamic_strategy_id(strategy_id: str) -> dict[str, Any] | None:
    match = _DYNAMIC_STRATEGY_ID_RE.match(strategy_id)
    if not match:
        return None
    values = match.groupdict()
    thread_count = int(values["thread_count"])
    stop_sessions = int(values["stop_sessions"])
    buy_pct = Decimal(values["buy_pct"])
    sell_pct = Decimal(values["sell_pct"])
    if not _is_supported_dynamic_parameter("thread_count", thread_count):
        return None
    if not _is_supported_dynamic_parameter("stop_sessions", stop_sessions):
        return None
    if not _is_supported_dynamic_parameter("buy_pct", buy_pct):
        return None
    if not _is_supported_dynamic_parameter("sell_pct", sell_pct):
        return None
    return {
        "strategy_id": strategy_id,
        "label": f"T{thread_count} / {stop_sessions}S / BUY {buy_pct:+.0f}% / SELL {sell_pct:+.0f}%",
        "thread_count": thread_count,
        "stop_sessions": stop_sessions,
        "buy_pct": buy_pct,
        "sell_pct": sell_pct,
        "mentor_profiles": [],
    }


def parse_regime_strategy_id(strategy_id: str) -> dict[str, Any] | None:
    match = _REGIME_STRATEGY_ID_RE.match(strategy_id)
    if not match:
        return None
    values = match.groupdict()
    thread_count = int(values["thread_count"])
    bull_stop_sessions = int(values["bull_stop_sessions"])
    bear_stop_sessions = int(values["bear_stop_sessions"])
    bull_buy_pct = Decimal(values["bull_buy_pct"])
    bull_sell_pct = Decimal(values["bull_sell_pct"])
    bear_buy_pct = Decimal(values["bear_buy_pct"])
    bear_sell_pct = Decimal(values["bear_sell_pct"])
    if bull_stop_sessions <= 0 or bear_stop_sessions <= 0:
        return None
    if bull_buy_pct > D("0") or bear_buy_pct > D("0"):
        return None
    if bull_sell_pct < D("0") or bear_sell_pct < D("0"):
        return None
    return {
        "strategy_id": strategy_id,
        "label": (
            f"T{thread_count} | "
            f"Bull {bull_stop_sessions}S / BUY {bull_buy_pct:+.0f}% / SELL {bull_sell_pct:+.0f}% | "
            f"Bear {bear_stop_sessions}S / BUY {bear_buy_pct:+.0f}% / SELL {bear_sell_pct:+.0f}%"
        ),
        "thread_count": thread_count,
        "bull_stop_sessions": bull_stop_sessions,
        "bull_buy_pct": bull_buy_pct,
        "bull_sell_pct": bull_sell_pct,
        "bear_stop_sessions": bear_stop_sessions,
        "bear_buy_pct": bear_buy_pct,
        "bear_sell_pct": bear_sell_pct,
        "mentor_profiles": [],
        "regime_enabled": True,
    }


def resolve_strategy_spec(
    strategy_id: str,
    *,
    catalog: tuple[dict[str, Any], ...] = CORE_PROFILE_CATALOG,
) -> dict[str, Any]:
    for row in catalog:
        if str(row["strategy_id"]) == strategy_id:
            return {
                **row,
                "buy_pct": D("0"),
                "sell_pct": D("0"),
            }
    parsed_regime = parse_regime_strategy_id(strategy_id)
    if parsed_regime is not None:
        return parsed_regime
    parsed = parse_dynamic_strategy_id(strategy_id)
    if parsed is not None:
        return parsed
    raise ValueError(f"Unknown strategy_id: {strategy_id}")


def iter_parameter_strategy_specs(
    definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION,
) -> list[dict[str, Any]]:
    values = definition["parameter_values"]
    specs: list[dict[str, Any]] = []
    for thread_count in values["thread_count"]:
        for stop_sessions in values["stop_sessions"]:
            for buy_pct in values["buy_pct"]:
                for sell_pct in values["sell_pct"]:
                    strategy_id = dynamic_strategy_id(thread_count, stop_sessions, buy_pct, sell_pct)
                    specs.append(
                        {
                            "strategy_id": strategy_id,
                            "label": f"T{thread_count} / {stop_sessions}S / BUY {buy_pct:+.0f}% / SELL {sell_pct:+.0f}%",
                            "thread_count": int(thread_count),
                            "stop_sessions": int(stop_sessions),
                            "buy_pct": D(buy_pct),
                            "sell_pct": D(sell_pct),
                            "mentor_profiles": [],
                        }
                    )
    return specs


def iter_regime_strategy_specs(base_config: StrategyConfig) -> list[dict[str, Any]]:
    thread_counts = [5, 6, 7]
    bull_stop_sessions = sorted({base_config.regime_base_stop_sessions, base_config.regime_bull_stop_sessions})
    bull_buy_pcts = sorted({base_config.regime_base_buy_pct, base_config.regime_bull_buy_pct})
    bull_sell_pcts = sorted({base_config.regime_base_sell_pct, base_config.regime_bull_sell_pct})
    bear_stop_sessions = sorted({base_config.regime_base_stop_sessions, base_config.regime_bear_stop_sessions})
    bear_buy_pcts = sorted({base_config.regime_base_buy_pct, base_config.regime_bear_buy_pct})
    bear_sell_pcts = sorted({base_config.regime_base_sell_pct, base_config.regime_bear_sell_pct})
    specs: list[dict[str, Any]] = []
    for thread_count in thread_counts:
        for bull_stop in bull_stop_sessions:
            for bull_buy in bull_buy_pcts:
                for bull_sell in bull_sell_pcts:
                    for bear_stop in bear_stop_sessions:
                        for bear_buy in bear_buy_pcts:
                            for bear_sell in bear_sell_pcts:
                                strategy_id = regime_strategy_id(
                                    thread_count,
                                    bull_stop,
                                    bull_buy,
                                    bull_sell,
                                    bear_stop,
                                    bear_buy,
                                    bear_sell,
                                )
                                specs.append(
                                    {
                                        "strategy_id": strategy_id,
                                        "label": (
                                            f"T{thread_count} | "
                                            f"Bull {bull_stop}S / BUY {Decimal(str(bull_buy)):+.0f}% / SELL {Decimal(str(bull_sell)):+.0f}% | "
                                            f"Bear {bear_stop}S / BUY {Decimal(str(bear_buy)):+.0f}% / SELL {Decimal(str(bear_sell)):+.0f}%"
                                        ),
                                        "thread_count": thread_count,
                                        "bull_stop_sessions": int(bull_stop),
                                        "bull_buy_pct": D(bull_buy),
                                        "bull_sell_pct": D(bull_sell),
                                        "bear_stop_sessions": int(bear_stop),
                                        "bear_buy_pct": D(bear_buy),
                                        "bear_sell_pct": D(bear_sell),
                                        "mentor_profiles": [],
                                        "regime_enabled": True,
                                    }
                                )
    return specs


def build_strategy_config(
    base_config: StrategyConfig,
    spec: dict[str, Any],
    *,
    execution_model: str,
    price_basis: str,
    definition: dict[str, Any] = PARAMETER_SWEEP_DEFINITION,
) -> StrategyConfig:
    if spec.get("regime_enabled") or regime_feature_enabled(base_config):
        return replace(
            base_config,
            thread_count=int(spec["thread_count"]),
            stop_sessions=base_config.regime_base_stop_sessions,
            take_profit_pct=base_config.regime_base_sell_pct,
            entry_drop_pct=base_config.regime_base_buy_pct,
            regime_enabled=True,
            regime_bull_stop_sessions=int(spec.get("bull_stop_sessions", base_config.regime_bull_stop_sessions)),
            regime_bull_buy_pct=D(spec.get("bull_buy_pct", base_config.regime_bull_buy_pct)),
            regime_bull_sell_pct=D(spec.get("bull_sell_pct", base_config.regime_bull_sell_pct)),
            regime_bear_stop_sessions=int(spec.get("bear_stop_sessions", base_config.regime_bear_stop_sessions)),
            regime_bear_buy_pct=D(spec.get("bear_buy_pct", base_config.regime_bear_buy_pct)),
            regime_bear_sell_pct=D(spec.get("bear_sell_pct", base_config.regime_bear_sell_pct)),
            execution_model=ExecutionModel(execution_model),
            price_basis=PriceBasis(price_basis),
            profile_id=str(spec["strategy_id"]),
        )
    fixed_values = definition.get("fixed_values", {})
    return replace(
        base_config,
        thread_count=int(spec["thread_count"]),
        stop_sessions=int(spec["stop_sessions"]),
        take_profit_pct=D(spec.get("sell_pct", 0)),
        entry_drop_pct=D(spec.get("buy_pct", 0)),
        stop_loss_pct=D(str(fixed_values.get("stop_loss_pct", 0))),
        max_entries_per_session=int(fixed_values.get("max_entries_per_session", 1)),
        take_profit_operator=str(fixed_values.get("take_profit_operator", "gt")),
        thread_selector=ThreadSelector(str(fixed_values.get("thread_selector", "round_robin"))),
        allow_same_session_thread_reuse=bool(fixed_values.get("allow_same_session_thread_reuse", True)),
        sizing_mode=SizingMode(str(fixed_values.get("sizing_mode", "fixed_principal"))),
        execution_model=ExecutionModel(execution_model),
        price_basis=PriceBasis(price_basis),
        profile_id=str(spec["strategy_id"]),
    )
