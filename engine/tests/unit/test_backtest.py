from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.backtest.engine import run_backtest
from buy_low_sell_high.backtest.metrics import _annualized_return_pct
from buy_low_sell_high.backtest.sweep import run_grid
from buy_low_sell_high.domain.models import DailySnapshot, MarketBar, StrategyConfig
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
        self.assertIn("cagr_pct", run.metrics)
        self.assertEqual(run.metrics["trade_count"], 1)

    def test_grid_runs_nine_combinations(self) -> None:
        bars = [make_bar(2, "10"), make_bar(3, "9"), make_bar(4, "11")]
        config = StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000})
        runs = run_grid(bars, config, [5, 6, 7], [10, 30, 40])
        self.assertEqual(len(runs), 9)

    def test_annualized_return_falls_back_to_total_return_when_terminal_equity_is_non_positive(self) -> None:
        daily = [
            DailySnapshot(
                session_date=date(2022, 1, 3),
                session_index=0,
                total_equity=D("10000"),
                realized_pnl=D("0"),
                drawdown=D("0"),
                open_threads=0,
                entries=0,
                take_profits=0,
                time_stops=0,
                skipped_entries=0,
            ),
            DailySnapshot(
                session_date=date(2022, 12, 30),
                session_index=1,
                total_equity=D("-360.50"),
                realized_pnl=D("-10360.50"),
                drawdown=D("-1.04"),
                open_threads=0,
                entries=0,
                take_profits=0,
                time_stops=0,
                skipped_entries=0,
            ),
        ]

        self.assertEqual(_annualized_return_pct(daily), D("-103.61"))


if __name__ == "__main__":
    unittest.main()
