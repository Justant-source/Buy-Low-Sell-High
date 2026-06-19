from __future__ import annotations

from datetime import date
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

from soxl_mania.cli import main
from soxl_mania.domain.models import MarketBar, StrategyConfig
from soxl_mania.domain.money import D
from soxl_mania.manual.ledger import (
    create_ledger,
    export_ledger,
    import_ledger,
    load_ledger,
    record_fill,
    reverse_fill,
    save_ledger,
    summarize_ledger,
)
from soxl_mania.manual.recommendation import build_recommendations
from soxl_mania.manual.reconciliation import reconcile_ledger


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

    def test_import_round_trip_preserves_fills(self) -> None:
        ledger = create_ledger("acct", 1, 1000)
        record_fill(ledger, thread_id=1, side="BUY", quantity="10", price="5")
        restored = import_ledger(export_ledger(ledger))
        self.assertEqual(restored.account_id, "acct")
        self.assertEqual(restored.threads[1].quantity, D("10"))
        self.assertEqual(len(restored.fills), 1)

    def test_cli_restore_rehydrates_exported_backup(self) -> None:
        ledger = create_ledger("acct", 1, 1000)
        record_fill(ledger, thread_id=1, side="BUY", quantity="10", price="5")
        with TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "backup.json"
            target_path = Path(temp_dir) / "restored.json"
            source_path.write_text(export_ledger(ledger), encoding="utf-8")
            stdout = StringIO()
            with patch(
                "sys.argv",
                [
                    "soxl-mania",
                    "manual",
                    "ledger",
                    "restore",
                    "--ledger-path",
                    str(target_path),
                    "--source-path",
                    str(source_path),
                ],
            ), redirect_stdout(stdout):
                exit_code = main()
            restored = load_ledger(target_path)
            self.assertEqual(exit_code, 0)
            self.assertEqual(restored.account_id, "acct")
            self.assertEqual(restored.threads[1].quantity, D("10"))

    def test_save_and_load_ledger_round_trip(self) -> None:
        ledger = create_ledger("acct", 2, 1000)
        record_fill(ledger, thread_id=1, side="BUY", quantity="4", price="10")
        with TemporaryDirectory() as temp_dir:
            ledger_path = Path(temp_dir) / "ledger.json"
            save_ledger(ledger_path, ledger)
            restored = load_ledger(ledger_path)
        self.assertEqual(restored.threads[1].quantity, D("4"))
        self.assertEqual(restored.threads[2].cash, D("500"))

    def test_reconciliation_flags_negative_cash(self) -> None:
        ledger = create_ledger("acct", 1, 100)
        record_fill(ledger, thread_id=1, side="BUY", quantity="100", price="2")
        issues = reconcile_ledger(ledger)
        self.assertTrue(issues)

    def test_summary_tracks_open_threads(self) -> None:
        ledger = create_ledger("acct", 2, 1000)
        record_fill(ledger, thread_id=1, side="BUY", quantity="4", price="10")
        summary = summarize_ledger(ledger)
        self.assertEqual(summary["thread_count"], 2)
        self.assertEqual(summary["open_threads"], 1)
        self.assertEqual(summary["fill_count"], 1)


if __name__ == "__main__":
    unittest.main()
