from __future__ import annotations

from datetime import date
import unittest

from soxl_mania.backtest.engine import run_backtest
from soxl_mania.domain.enums import CloseReason, EventOrder, ExecutionModel, PriceBasis, SizingMode, ThreadSelector
from soxl_mania.domain.models import MarketBar, StrategyConfig
from soxl_mania.domain.money import D


def bar(day: int, close: str, *, open_: str | None = None, split: str = "1") -> MarketBar:
    price = D(close)
    open_price = D(open_ or close)
    high = max(price, open_price) + D("1")
    low = min(price, open_price) - D("1")
    return MarketBar(
        symbol="SOXL",
        session_date=date(2024, 1, day),
        open=open_price,
        high=high,
        low=low,
        close=price,
        adj_close=price,
        split_ratio=D(split),
    )


class StrategyTest(unittest.TestCase):
    def make_config(self, **overrides: object) -> StrategyConfig:
        return StrategyConfig.from_mapping(
            {
                "symbol": "SOXL",
                "thread_count": 2,
                "stop_sessions": 2,
                "initial_capital": 1000,
                "execution_model": "ideal_same_close",
                "price_basis": "adjusted_close",
                "sizing_mode": "fixed_principal",
                **overrides,
            }
        )

    def test_first_day_has_no_entry(self) -> None:
        run = run_backtest([bar(2, "10"), bar(3, "9")], self.make_config())
        self.assertEqual([event.event_type for event in run.events].count("ENTRY"), 1)

    def test_down_day_opens_one_free_thread(self) -> None:
        run = run_backtest([bar(2, "10"), bar(3, "9"), bar(4, "8")], self.make_config())
        self.assertEqual([event.event_type for event in run.events].count("ENTRY"), 2)

    def test_skip_when_all_threads_busy(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "8"), bar(5, "7"), bar(6, "6")]
        run = run_backtest(bars, self.make_config(thread_count=1, stop_sessions=99))
        self.assertTrue(any(event.event_type == "SKIPPED_NO_FREE_THREAD" for event in run.events))

    def test_profit_takes_precedence(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "11")]
        run = run_backtest(bars, self.make_config(stop_sessions=1))
        self.assertEqual(run.trades[0].close_reason.value, "TAKE_PROFIT")

    def test_equal_price_is_not_profit(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "9"), bar(5, "9")]
        run = run_backtest(bars, self.make_config(thread_count=1, stop_sessions=1))
        self.assertEqual(run.trades[0].close_reason.value, "TIME_STOP")

    def test_time_stop_on_nth_session(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "8"), bar(5, "8")]
        run = run_backtest(bars, self.make_config(thread_count=1, stop_sessions=2))
        self.assertEqual(run.trades[0].holding_sessions, 2)

    def test_multiple_threads_can_close_same_day(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "8"), bar(5, "12")]
        run = run_backtest(bars, self.make_config(thread_count=2, stop_sessions=10))
        self.assertEqual(len(run.trades), 2)

    def test_same_session_thread_reuse_respects_flag(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "11"), bar(5, "10")]
        no_reuse = run_backtest(bars, self.make_config(thread_count=1, allow_same_session_thread_reuse=False))
        reuse = run_backtest(bars, self.make_config(thread_count=1, allow_same_session_thread_reuse=True))
        self.assertLessEqual(len(no_reuse.trades), len(reuse.trades))

    def test_split_does_not_change_economic_result(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "4.5", split="2"), bar(5, "5.5")]
        run = run_backtest(bars, self.make_config(thread_count=1, stop_sessions=10))
        self.assertGreater(run.daily[-1].total_equity, D("0"))

    def test_event_log_is_deterministic(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "11")]
        first = run_backtest(bars, self.make_config())
        second = run_backtest(bars, self.make_config())
        self.assertEqual(
            [(event.event_type, event.thread_id, str(event.price)) for event in first.events],
            [(event.event_type, event.thread_id, str(event.price)) for event in second.events],
        )

    def test_next_open_uses_next_day_open(self) -> None:
        bars = [
            bar(2, "10", open_="10"),
            bar(3, "9", open_="9"),
            bar(4, "11", open_="12"),
            bar(5, "13", open_="13"),
        ]
        run = run_backtest(bars, self.make_config(execution_model="next_open", thread_count=1))
        entry_fill = next(event for event in run.events if event.event_type == "ENTRY_FILL")
        self.assertEqual(str(entry_fill.price), "12")

    def test_take_profit_pct_requires_threshold_excess(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "9.45"), bar(5, "9.46")]
        run = run_backtest(
            bars,
            self.make_config(thread_count=1, stop_sessions=99, take_profit_pct="5", take_profit_operator="gt"),
        )
        self.assertEqual(run.trades[0].close_reason, CloseReason.TAKE_PROFIT)
        self.assertEqual(run.trades[0].fill_exit_date, date(2024, 1, 5))

    def test_entry_drop_pct_requires_threshold_breach(self) -> None:
        bars = [bar(2, "10"), bar(3, "9.9"), bar(4, "9.7"), bar(5, "9.6")]
        run = run_backtest(bars, self.make_config(thread_count=1, stop_sessions=99, entry_drop_pct="2"))
        entry_dates = [event.session_date for event in run.events if event.event_type == "ENTRY"]
        self.assertEqual(entry_dates, [date(2024, 1, 4)])

    def test_stop_loss_pct_closes_immediately(self) -> None:
        bars = [bar(2, "10"), bar(3, "9"), bar(4, "8.1")]
        run = run_backtest(bars, self.make_config(thread_count=1, stop_sessions=99, stop_loss_pct="10"))
        self.assertEqual(run.trades[0].close_reason, CloseReason.PRICE_STOP)

    def test_max_entries_per_session_allows_multiple_new_threads(self) -> None:
        bars = [bar(2, "10"), bar(3, "9")]
        run = run_backtest(bars, self.make_config(thread_count=3, max_entries_per_session=2, stop_sessions=99))
        self.assertEqual([event.event_type for event in run.events].count("ENTRY"), 2)

    def test_config_hash_changes_with_threshold_fields(self) -> None:
        base = self.make_config()
        changed = self.make_config(take_profit_pct="5", entry_drop_pct="2", stop_loss_pct="10", take_profit_operator="gte")
        self.assertNotEqual(base.config_hash(), changed.config_hash())


if __name__ == "__main__":
    unittest.main()
