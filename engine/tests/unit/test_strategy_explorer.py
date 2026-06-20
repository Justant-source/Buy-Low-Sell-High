from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.strategy_explorer import build_strategy_explorer


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
                    "strategy_id": "5x10",
                    "label": "5T / 10S",
                    "thread_count": 5,
                    "stop_sessions": 10,
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
        self.assertEqual(len(payload["strategies"]), 2)
        self.assertIn("metrics", payload["strategies"][0])
        self.assertIn("monthly", payload["strategies"][0])
        self.assertIn("segments", payload["strategies"][0])
        self.assertEqual(payload["strategies"][1]["mentor_profiles"], ["soxl_default_7x30"])
        segment_ids = {row["segment_id"] for row in payload["strategies"][0]["segments"]}
        self.assertIn("2025-latest", segment_ids)


if __name__ == "__main__":
    unittest.main()
