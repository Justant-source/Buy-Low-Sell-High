from __future__ import annotations

from .regime import ResolvedRegimeContext
from .metrics import compute_metrics, yearly_summary
from ..domain.models import BacktestRun, MarketBar, StrategyConfig
from ..strategies.ddeolsao_pal import run_strategy


def run_backtest(
    bars: list[MarketBar],
    config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    regime_context: ResolvedRegimeContext | None = None,
) -> BacktestRun:
    run = run_strategy(bars, config, data_hash=data_hash, regime_context=regime_context)
    run.yearly = yearly_summary(run)
    run.metrics = compute_metrics(run)
    return run
