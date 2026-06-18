from __future__ import annotations

from soxl_mania.domain.models import MarketBar, StrategyConfig
from soxl_mania.domain.money import D
from soxl_mania.manual.ledger import create_ledger, export_ledger, record_fill, reverse_fill
from soxl_mania.manual.recommendation import build_recommendations
from soxl_mania.manual.reconciliation import reconcile_ledger
from datetime import date
import unittest


def market_bar(day: int, close: str) -> MarketBar:
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


class ManualTest(unittest.TestCase):
    def test_recommendation_does_not_execute_order(self) -> None:
        config = StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 2, "initial_capital": 1000})
        recs = build_recommendations([market_bar(2, "10"), market_bar(3, "9")], config, {})
        self.assertEqual(recs[0].action.value, "BUY")

    def test_fill_and_reverse_restore_quantity(self) -> None:
        ledger = create_ledger("acct", 1, 1000)
        fill = record_fill(ledger, thread_id=1, side="BUY", quantity="10", price="5")
        reverse_fill(ledger, fill.fill_id)
        self.assertEqual(ledger.threads[1].quantity, D("0"))

    def test_export_is_json(self) -> None:
        ledger = create_ledger("acct", 1, 1000)
        self.assertIn('"account_id": "acct"', export_ledger(ledger))

    def test_reconciliation_flags_negative_cash(self) -> None:
        ledger = create_ledger("acct", 1, 100)
        record_fill(ledger, thread_id=1, side="BUY", quantity="100", price="2")
        issues = reconcile_ledger(ledger)
        self.assertTrue(issues)


if __name__ == "__main__":
    unittest.main()

