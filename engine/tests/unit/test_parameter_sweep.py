from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.parameter_sweep import build_parameter_sweep
from buy_low_sell_high.reporting.research_common import PARAMETER_SWEEP_DEFINITION


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
                    "stop_sessions": [30, 40],
                    "buy_pct": [0, 1],
                    "sell_pct": [0],
                },
                "fixed_values": {
                    "take_profit_operator": "gt",
                    "thread_selector": "round_robin",
                    "allow_same_session_thread_reuse": True,
                    "sizing_mode": "fixed_principal",
                    "stop_loss_pct": 0,
                    "max_entries_per_session": 1,
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
        self.assertIn("cagr_pct", payload["rows"][0]["metrics"])
        self.assertIn("mean_segment_return_pct", payload["rows"][0]["metrics"])
        self.assertEqual(payload["summary"]["ranking_basis"], "cagr desc, max_drawdown desc, full_return desc")
        self.assertEqual(set(payload["rows"][0]["params"].keys()), {"thread_count", "stop_sessions", "buy_pct", "sell_pct"})
        self.assertEqual(payload["meta"]["segment_presets"][0]["preset_id"], "2025-latest")

    def test_default_sweep_definition_expands_to_726_combos(self) -> None:
        combo_count = 1
        for values in PARAMETER_SWEEP_DEFINITION["parameter_values"].values():
            combo_count *= len(values)
        self.assertEqual(combo_count, 726)


if __name__ == "__main__":
    unittest.main()
