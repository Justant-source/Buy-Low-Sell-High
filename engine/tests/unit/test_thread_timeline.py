from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.thread_timeline import build_thread_timeline


def bar(year: int, month: int, day: int, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="SOXL",
        session_date=date(year, month, day),
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
    )


class ThreadTimelineTest(unittest.TestCase):
    def test_single_trade_interval_and_end_of_session_state(self) -> None:
        payload = build_thread_timeline(
            [
                bar(2024, 1, 2, "10"),
                bar(2024, 1, 3, "9"),
                bar(2024, 1, 4, "11"),
            ],
            StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 10, "initial_capital": 1000}),
            data_hash="fixture-hash",
            strategy_id="1x10",
            catalog=(
                {
                    "strategy_id": "1x10",
                    "label": "1T / 10S",
                    "thread_count": 1,
                    "stop_sessions": 10,
                    "mentor_profiles": [],
                },
            ),
        )

        lane = payload["lanes"][0]
        self.assertEqual(lane["thread_id"], 1)
        self.assertEqual(len(lane["intervals"]), 1)
        interval = lane["intervals"][0]
        self.assertEqual(interval["start_date"], "2024-01-03")
        self.assertEqual(interval["end_date"], "2024-01-04")
        self.assertEqual(interval["close_reason"], "TAKE_PROFIT")

        entry_session = next(session for session in payload["sessions"] if session["session_date"] == "2024-01-03")
        exit_session = next(session for session in payload["sessions"] if session["session_date"] == "2024-01-04")
        self.assertEqual(entry_session["entries"], 1)
        self.assertEqual(entry_session["entry_batch"][0]["shares"], "111")
        self.assertEqual(len(entry_session["open_positions"]), 1)
        self.assertEqual(exit_session["exit_count"], 1)
        self.assertEqual(len(exit_session["open_positions"]), 0)

    def test_multi_exit_session_reports_batch_count(self) -> None:
        payload = build_thread_timeline(
            [
                bar(2024, 1, 2, "10"),
                bar(2024, 1, 3, "9"),
                bar(2024, 1, 4, "8"),
                bar(2024, 1, 5, "10"),
            ],
            StrategyConfig.from_mapping({"thread_count": 2, "stop_sessions": 10, "initial_capital": 1000}),
            data_hash="fixture-hash",
            strategy_id="2x10",
            catalog=(
                {
                    "strategy_id": "2x10",
                    "label": "2T / 10S",
                    "thread_count": 2,
                    "stop_sessions": 10,
                    "mentor_profiles": [],
                },
            ),
        )

        exit_session = next(session for session in payload["sessions"] if session["session_date"] == "2024-01-05")
        self.assertEqual(exit_session["exit_count"], 2)
        self.assertEqual(len(exit_session["exit_batch"]), 2)
        self.assertEqual({row["thread_id"] for row in exit_session["exit_batch"]}, {1, 2})

    def test_time_stop_reason_is_propagated(self) -> None:
        payload = build_thread_timeline(
            [
                bar(2024, 1, 2, "10"),
                bar(2024, 1, 3, "9"),
                bar(2024, 1, 4, "8"),
            ],
            StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 1, "initial_capital": 1000}),
            data_hash="fixture-hash",
            strategy_id="1x1",
            catalog=(
                {
                    "strategy_id": "1x1",
                    "label": "1T / 1S",
                    "thread_count": 1,
                    "stop_sessions": 1,
                    "mentor_profiles": [],
                },
            ),
        )

        exit_session = next(session for session in payload["sessions"] if session["session_date"] == "2024-01-04")
        self.assertEqual(exit_session["exit_batch"][0]["close_reason"], "TIME_STOP")

    def test_open_position_stays_visible_without_exit(self) -> None:
        payload = build_thread_timeline(
            [
                bar(2024, 1, 2, "10"),
                bar(2024, 1, 3, "9"),
                bar(2024, 1, 4, "8"),
            ],
            StrategyConfig.from_mapping({"thread_count": 2, "stop_sessions": 10, "initial_capital": 1000}),
            data_hash="fixture-hash",
            strategy_id="2x10",
            catalog=(
                {
                    "strategy_id": "2x10",
                    "label": "2T / 10S",
                    "thread_count": 2,
                    "stop_sessions": 10,
                    "mentor_profiles": [],
                },
            ),
        )

        last_session = payload["sessions"][-1]
        self.assertEqual(last_session["open_threads"], 2)
        self.assertEqual(len(last_session["open_positions"]), 2)
        self.assertTrue(any(interval["end_date"] is None for lane in payload["lanes"] for interval in lane["intervals"]))


if __name__ == "__main__":
    unittest.main()
