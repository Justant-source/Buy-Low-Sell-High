from __future__ import annotations

from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import timedelta
import unittest

from buy_low_sell_high.data.providers.yahoo_provider import write_bars_to_csv
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


def qqq_weekly_bar(start_friday: date, week_offset: int, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="QQQ",
        session_date=start_friday + timedelta(weeks=week_offset),
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
    )


class ThreadTimelineTest(unittest.TestCase):
    def _write_regime_csv(self, bars: list[MarketBar]) -> str:
        temp_dir = TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        csv_path = Path(temp_dir.name) / "qqq.csv"
        write_bars_to_csv(csv_path, bars)
        return str(csv_path)

    def test_single_trade_interval_and_end_of_session_state(self) -> None:
        payload = build_thread_timeline(
            [
                bar(2024, 1, 2, "10"),
                bar(2024, 1, 3, "9"),
                bar(2024, 1, 4, "11"),
            ],
            StrategyConfig.from_mapping(
                {"thread_count": 1, "stop_sessions": 10, "initial_capital": 1000, "commission_bps": "0", "transaction_tax_bps": "0", "slippage_bps": "0"}
            ),
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
        self.assertEqual(entry_session["entry_batch"][0]["entry_fee"], "0.00")
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
            StrategyConfig.from_mapping(
                {"thread_count": 2, "stop_sessions": 10, "initial_capital": 1000, "commission_bps": "0", "transaction_tax_bps": "0", "slippage_bps": "0"}
            ),
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
            StrategyConfig.from_mapping(
                {"thread_count": 1, "stop_sessions": 1, "initial_capital": 1000, "commission_bps": "0", "transaction_tax_bps": "0", "slippage_bps": "0"}
            ),
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
            StrategyConfig.from_mapping(
                {"thread_count": 2, "stop_sessions": 10, "initial_capital": 1000, "commission_bps": "0", "transaction_tax_bps": "0", "slippage_bps": "0"}
            ),
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

    def test_dynamic_four_parameter_strategy_id_is_supported(self) -> None:
        payload = build_thread_timeline(
            [
                bar(2024, 1, 2, "10"),
                bar(2024, 1, 3, "9"),
                bar(2024, 1, 4, "11"),
            ],
            StrategyConfig.from_mapping(
                {"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000, "commission_bps": "0", "transaction_tax_bps": "0", "slippage_bps": "0"}
            ),
            data_hash="fixture-hash",
            strategy_id="t5-s40-buy-2-sell+3",
        )
        self.assertEqual(payload["meta"]["strategy_id"], "t5-s40-buy-2-sell+3")
        self.assertEqual(payload["meta"]["thread_count"], 5)
        self.assertEqual(payload["meta"]["stop_sessions"], 40)

    def test_default_fee_metadata_and_totals_are_exposed(self) -> None:
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
        interval = payload["lanes"][0]["intervals"][0]
        self.assertEqual(payload["meta"]["commission_bps"], "25")
        self.assertEqual(payload["meta"]["transaction_tax_bps"], "0")
        self.assertEqual(interval["entry_fee"], "2.48")
        self.assertEqual(interval["exit_fee"], "3.03")
        self.assertEqual(interval["total_fees"], "5.51")

    def test_regime_metadata_and_session_labels_are_exposed_for_soxl(self) -> None:
        regime_bars = [qqq_weekly_bar(date(2024, 1, 5), index, str(100 - index)) for index in range(15)] + [
            qqq_weekly_bar(date(2024, 1, 5), 15, "84")
        ]
        payload = build_thread_timeline(
            [
                bar(2024, 4, 22, "10"),
                bar(2024, 4, 23, "9"),
                bar(2024, 4, 24, "8"),
            ],
            StrategyConfig.from_mapping(
                {
                    "symbol": "SOXL",
                    "thread_count": 1,
                    "stop_sessions": 30,
                    "initial_capital": 1000,
                    "commission_bps": "0",
                    "transaction_tax_bps": "0",
                    "slippage_bps": "0",
                    "regime_enabled": True,
                    "regime_symbol": "QQQ",
                    "regime_csv_path": self._write_regime_csv(regime_bars),
                    "regime_base_stop_sessions": 30,
                    "regime_base_buy_pct": "0",
                    "regime_base_sell_pct": "99",
                    "regime_bull_stop_sessions": 30,
                    "regime_bull_buy_pct": "0",
                    "regime_bull_sell_pct": "99",
                    "regime_bear_stop_sessions": 1,
                    "regime_bear_buy_pct": "0",
                    "regime_bear_sell_pct": "99",
                }
            ),
            data_hash="fixture-hash",
            strategy_id="rt5-bst30-bbuy+0-bsell+99-rst1-rbuy+0-rsell+99",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
        )

        self.assertEqual(payload["meta"]["regime_enabled"], True)
        self.assertEqual(payload["meta"]["regime_symbol"], "QQQ")
        self.assertTrue(payload["meta"]["regime_data_hash"])
        self.assertTrue(payload["meta"]["regime_config_hash"])
        self.assertEqual(payload["sessions"][0]["applied_regime"], "defense")
        self.assertEqual(payload["sessions"][1]["entry_batch"][0]["entry_regime"], "defense")
        self.assertEqual(payload["sessions"][2]["exit_batch"][0]["entry_regime"], "defense")


if __name__ == "__main__":
    unittest.main()
