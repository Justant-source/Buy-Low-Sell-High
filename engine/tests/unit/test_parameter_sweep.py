from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.parameter_sweep import build_parameter_sweep


def bar(day: int, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="SOXL",
        session_date=date(2025, 1, day),
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
    )


class ParameterSweepTest(unittest.TestCase):
    def test_parameter_sweep_returns_ranked_rows_and_flags(self) -> None:
        bars = [
            bar(2, "10"),
            bar(3, "9"),
            bar(6, "11"),
            bar(7, "10"),
            bar(8, "9"),
            bar(9, "12"),
        ]
        payload = build_parameter_sweep(
            bars,
            StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000}),
            data_hash="fixture-hash",
            definition={
                "sweep_id": "mini",
                "parameter_values": {
                    "thread_count": [5],
                    "stop_sessions": [10, 30],
                    "take_profit_pct": [0],
                    "entry_drop_pct": [0],
                    "stop_loss_pct": [0, 5],
                    "max_entries_per_session": [1],
                },
                "fixed_values": {
                    "take_profit_operator": "gt",
                    "thread_selector": "round_robin",
                    "allow_same_session_thread_reuse": True,
                    "sizing_mode": "fixed_principal",
                    "price_basis": "adjusted_close",
                    "execution_model": "next_open",
                },
            },
            sweep_id="mini",
        )

        self.assertEqual(payload["meta"]["data_hash"], "fixture-hash")
        self.assertEqual(payload["meta"]["combo_count"], 4)
        self.assertEqual(len(payload["rows"]), 4)
        self.assertIn("best_robust_combo", payload["summary"])
        self.assertIn("flags", payload["rows"][0])
        self.assertIn("pareto_return_mdd", payload["rows"][0]["flags"])
        self.assertIn("mean_segment_return_pct", payload["rows"][0]["metrics"])
        self.assertEqual(payload["meta"]["segment_presets"][0]["preset_id"], "2025-latest")


if __name__ == "__main__":
    unittest.main()
