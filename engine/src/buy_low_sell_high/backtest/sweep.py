from __future__ import annotations

from ..domain.models import BacktestRun, MarketBar, StrategyConfig
from .engine import run_backtest


def run_grid(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    thread_counts: list[int],
    stop_sessions: list[int],
    *,
    data_hash: str = "adhoc",
) -> list[BacktestRun]:
    runs: list[BacktestRun] = []
    for thread_count in thread_counts:
        for stop in stop_sessions:
            config = StrategyConfig.from_mapping(
                {
                    **base_config.__dict__,
                    "thread_count": thread_count,
                    "stop_sessions": stop,
                    "profile_id": f"{thread_count}x{stop}",
                }
            )
            runs.append(run_backtest(bars, config, data_hash=data_hash))
    return runs

