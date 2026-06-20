from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.backtest.engine import run_backtest
from buy_low_sell_high.backtest.sweep import run_grid
from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D


def make_bar(day: int, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="SOXL",
        session_date=date(2024, 1, day),
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
    )


class BacktestTest(unittest.TestCase):
    def test_metrics_are_present(self) -> None:
        bars = [make_bar(2, "10"), make_bar(3, "9"), make_bar(4, "11")]
        config = StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 1, "initial_capital": 1000})
        run = run_backtest(bars, config)
        self.assertIn("total_return_pct", run.metrics)
        self.assertEqual(run.metrics["trade_count"], 1)

    def test_grid_runs_nine_combinations(self) -> None:
        bars = [make_bar(2, "10"), make_bar(3, "9"), make_bar(4, "11")]
        config = StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000})
        runs = run_grid(bars, config, [5, 6, 7], [10, 30, 40])
        self.assertEqual(len(runs), 9)


if __name__ == "__main__":
    unittest.main()

