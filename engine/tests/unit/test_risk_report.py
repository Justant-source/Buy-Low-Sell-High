from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.risk_report import build_risk_report


def bar(day: int, close: str, *, open_: str | None = None) -> MarketBar:
    price = D(close)
    open_price = D(open_ or close)
    return MarketBar(
        symbol="SOXL",
        session_date=date(2024, 1, day),
        open=open_price,
        high=max(price, open_price) + D("1"),
        low=min(price, open_price) - D("1"),
        close=price,
        adj_close=price,
    )


class RiskReportTest(unittest.TestCase):
    def test_risk_report_contains_model_and_cost_sections(self) -> None:
        bars = [
            bar(2, "10", open_="10"),
            bar(3, "9", open_="9"),
            bar(4, "11", open_="12"),
            bar(5, "12", open_="12"),
            bar(6, "10", open_="10"),
            bar(7, "13", open_="13"),
        ]
        config = StrategyConfig.from_mapping({"thread_count": 5, "stop_sessions": 30, "initial_capital": 1000})
        report = build_risk_report(bars, config, data_hash="fixture-hash")

        self.assertEqual(report["profile_id"], "custom")
        self.assertEqual(len(report["model_comparison"]), 3)
        self.assertEqual(len(report["cost_sensitivity"]), 3)
        self.assertIn("ideal_to_next_open_return_drag_pct", report["summary"])
        self.assertIn("best_next_open_return_cell", report["sensitivity_summary"])
        self.assertEqual(len(report["warnings"]), 3)

    def test_recovery_sessions_are_reported(self) -> None:
        bars = [
            bar(2, "10"),
            bar(3, "9"),
            bar(4, "8"),
            bar(5, "12"),
            bar(6, "13"),
        ]
        config = StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 10, "initial_capital": 1000})
        report = build_risk_report(bars, config, data_hash="fixture-hash")

        next_open = next(row for row in report["model_comparison"] if row["execution_model"] == "next_open")
        self.assertIn("peak_to_recovery_sessions", next_open)
        self.assertIn("recovered", next_open)


if __name__ == "__main__":
    unittest.main()
