from __future__ import annotations

from decimal import Decimal

from ..domain.enums import SizingMode
from ..domain.models import CapitalThread, StrategyConfig
from ..domain.money import D


def entry_budget(
    config: StrategyConfig,
    thread: CapitalThread,
    total_equity: Decimal,
    initial_thread_principal: Decimal,
) -> Decimal:
    if config.sizing_mode == SizingMode.FIXED_PRINCIPAL:
        return initial_thread_principal
    if config.sizing_mode == SizingMode.THREAD_COMPOUND:
        return thread.free_equity
    return total_equity / D(config.thread_count)

