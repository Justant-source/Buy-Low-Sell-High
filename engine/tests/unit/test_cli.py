from __future__ import annotations

from pathlib import Path
import unittest

from soxl_mania.cli import default_manual_ledger_path, default_market_data_csv


class CliDefaultsTest(unittest.TestCase):
    def test_default_market_data_csv_points_to_repo_snapshot(self) -> None:
        path = Path(default_market_data_csv())
        self.assertEqual(path.name, "soxl_daily_2011_present.csv")
        self.assertEqual(path.parent.name, "raw")
        self.assertEqual(path.parent.parent.name, "data")

    def test_default_manual_ledger_path_points_to_dashboard_runtime(self) -> None:
        path = Path(default_manual_ledger_path())
        self.assertEqual(path.name, "manual_ledger.json")
        self.assertEqual(path.parent.name, "dashboard")
        self.assertEqual(path.parent.parent.name, "runtime")


if __name__ == "__main__":
    unittest.main()
