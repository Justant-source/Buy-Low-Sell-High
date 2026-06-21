from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from datetime import date, timedelta
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.strategy_explorer import build_slice_strategy_rankings, build_strategy_detail, build_strategy_explorer, filter_bars_to_slice
from buy_low_sell_high.reporting.strategy_specs import parse_dynamic_strategy_id


def dated_bar(session_date: date, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="SOXL",
        session_date=session_date,
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
    )


def bar(year: int, month: int, day: int, close: str) -> MarketBar:
    return dated_bar(date(year, month, day), close)


class StrategyExplorerTest(unittest.TestCase):
    def test_strategy_explorer_returns_catalog_payload(self) -> None:
        bars = [
            bar(2023, 12, 29, "10"),
            bar(2024, 1, 2, "9"),
            bar(2024, 1, 3, "11"),
            bar(2025, 1, 2, "10"),
            bar(2025, 1, 3, "9"),
            bar(2025, 1, 6, "12"),
        ]
        payload = build_strategy_explorer(
            bars,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            data_hash="fixture-hash",
            catalog=(
                {
                    "strategy_id": "5x30",
                    "label": "5T / 30S",
                    "thread_count": 5,
                    "stop_sessions": 30,
                    "mentor_profiles": [],
                },
                {
                    "strategy_id": "7x30",
                    "label": "7T / 30S",
                    "thread_count": 7,
                    "stop_sessions": 30,
                    "mentor_profiles": ["soxl_default_7x30"],
                },
            ),
        )

        self.assertEqual(payload["meta"]["data_hash"], "fixture-hash")
        self.assertEqual(payload["meta"]["execution_model"], "next_open")
        self.assertGreaterEqual(len(payload["meta"]["slice_presets"]), 4)
        self.assertEqual(payload["benchmark"]["label"], "Buy & Hold")
        self.assertEqual(payload["benchmark"]["combo_key"], "Buy & Hold")
        self.assertEqual(payload["benchmark"]["daily"][-1]["session_date"], "2025-01-06")
        self.assertEqual(len(payload["strategies"]), 2)
        self.assertEqual(payload["meta"]["ranking_basis"], "mean_segment_return desc, segment_stddev asc, full_return desc")
        self.assertEqual(len(payload["rankings"]), 2)
        self.assertIn("metrics", payload["strategies"][0])
        self.assertIn("monthly", payload["strategies"][0])
        self.assertIn("segments", payload["strategies"][0])
        self.assertIn("rank", payload["rankings"][0])
        self.assertIn("combo_key", payload["rankings"][0])
        self.assertEqual(payload["strategies"][1]["mentor_profiles"], ["soxl_default_7x30"])
        segment_ids = {row["segment_id"] for row in payload["strategies"][0]["segments"]}
        self.assertIn("2025-latest", segment_ids)

    def test_strategy_detail_accepts_dynamic_four_parameter_strategy_id(self) -> None:
        bars = [
            bar(2024, 1, 2, "10"),
            bar(2024, 1, 3, "9"),
            bar(2024, 1, 4, "11"),
        ]
        payload = build_strategy_detail(
            bars,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            strategy_id="t5-s40-buy-2-sell+3",
            data_hash="fixture-hash",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
        )
        self.assertEqual(payload["strategy_id"], "t5-s40-buy-2-sell+3")
        self.assertEqual(payload["thread_count"], 5)
        self.assertEqual(payload["stop_sessions"], 40)
        self.assertEqual(payload["buy_pct"], -2.0)
        self.assertEqual(payload["sell_pct"], 3.0)
        self.assertIn("display_params", payload)

    def test_dynamic_strategy_id_rejects_positive_buy_and_negative_sell(self) -> None:
        self.assertIsNone(parse_dynamic_strategy_id("t5-s40-buy+1-sell+3"))
        self.assertIsNone(parse_dynamic_strategy_id("t5-s40-buy-2-sell-1"))

    def test_strategy_detail_rejects_unsupported_dynamic_parameters(self) -> None:
        bars = [
            bar(2024, 1, 2, "10"),
            bar(2024, 1, 3, "9"),
            bar(2024, 1, 4, "11"),
        ]
        with self.assertRaisesRegex(ValueError, "Unknown strategy_id"):
            build_strategy_detail(
                bars,
                StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
                strategy_id="t5-s40-buy+1-sell+3",
                data_hash="fixture-hash",
                execution_model="ideal_same_close",
                price_basis="adjusted_close",
            )

    def test_slice_strategy_rankings_return_top_ten_dynamic_combos(self) -> None:
        bars = [
            bar(2024, 1, 2, "10"),
            bar(2024, 1, 3, "9"),
            bar(2024, 1, 4, "11"),
            bar(2025, 1, 2, "10"),
            bar(2025, 1, 3, "9"),
            bar(2025, 1, 6, "12"),
        ]
        sliced = filter_bars_to_slice(bars, slice_start=date(2025, 1, 2), slice_end=date(2025, 1, 6))
        payload = build_slice_strategy_rankings(
            sliced,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            data_hash="fixture-hash",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
            limit=10,
        )
        self.assertEqual(payload["meta"]["combo_count"], 726)
        self.assertEqual(len(payload["rows"]), 10)
        self.assertEqual(payload["meta"]["ranking_basis"], "cagr desc, max_drawdown desc, full_return desc, combo_key asc")
        self.assertTrue(payload["rows"][0]["strategy_id"].startswith("t"))
        self.assertIn("BUY", payload["rows"][0]["display_params"])
        self.assertIn("cagr_pct", payload["rows"][0])
        self.assertIn("max_drawdown_pct", payload["rows"][0])

    def test_slice_strategy_rankings_limit_zero_returns_all_dynamic_combos(self) -> None:
        bars = [
            bar(2024, 1, 2, "10"),
            bar(2024, 1, 3, "9"),
            bar(2024, 1, 4, "11"),
            bar(2025, 1, 2, "10"),
            bar(2025, 1, 3, "9"),
            bar(2025, 1, 6, "12"),
        ]
        sliced = filter_bars_to_slice(bars, slice_start=date(2025, 1, 2), slice_end=date(2025, 1, 6))
        payload = build_slice_strategy_rankings(
            sliced,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            data_hash="fixture-hash",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
            limit=0,
        )
        self.assertEqual(payload["meta"]["combo_count"], 726)
        self.assertEqual(len(payload["rows"]), 726)
        self.assertEqual(payload["rows"][0]["rank"], 1)
        self.assertEqual(payload["rows"][-1]["rank"], 726)

    def test_slice_strategy_rankings_parallel_matches_serial(self) -> None:
        bars = [
            bar(2024, 1, 2, "10"),
            bar(2024, 1, 3, "9"),
            bar(2024, 1, 4, "11"),
            bar(2025, 1, 2, "10"),
            bar(2025, 1, 3, "9"),
            bar(2025, 1, 6, "12"),
        ]
        sliced = filter_bars_to_slice(bars, slice_start=date(2025, 1, 2), slice_end=date(2025, 1, 6))
        serial_payload = build_slice_strategy_rankings(
            sliced,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            data_hash="fixture-hash",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
            limit=10,
            max_workers=1,
        )
        parallel_payload = build_slice_strategy_rankings(
            sliced,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            data_hash="fixture-hash",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
            limit=10,
            max_workers=2,
        )
        with ProcessPoolExecutor(max_workers=2) as executor:
            pooled_payload = build_slice_strategy_rankings(
                sliced,
                StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
                data_hash="fixture-hash",
                execution_model="ideal_same_close",
                price_basis="adjusted_close",
                limit=10,
                max_workers=2,
                executor=executor,
            )
        self.assertEqual(parallel_payload["meta"], serial_payload["meta"])
        self.assertEqual(parallel_payload["rows"], serial_payload["rows"])
        self.assertEqual(pooled_payload["meta"], serial_payload["meta"])
        self.assertEqual(pooled_payload["rows"], serial_payload["rows"])

    def test_slice_strategy_rankings_parallel_handles_non_positive_terminal_equity(self) -> None:
        bars = [
            dated_bar(date(2024, 1, 2) + timedelta(days=offset), f"{100 - (offset * 1.3):.2f}")
            for offset in range(70)
        ]
        payload = build_slice_strategy_rankings(
            bars,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 10000}),
            data_hash="fixture-hash",
            execution_model="ideal_same_close",
            price_basis="adjusted_close",
            limit=10,
            max_workers=2,
        )

        self.assertEqual(payload["meta"]["combo_count"], 726)
        self.assertEqual(len(payload["rows"]), 10)
        self.assertEqual(payload["rows"][0]["rank"], 1)


if __name__ == "__main__":
    unittest.main()
