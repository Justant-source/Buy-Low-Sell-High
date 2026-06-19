from __future__ import annotations

from argparse import Namespace
from pathlib import Path
import unittest

from soxl_mania.backtest.parity import ParityResult
from soxl_mania.cli import _load_strategy_config_with_overrides, _parity_exit_code, _serialize_config, default_manual_ledger_path, default_market_data_csv
from soxl_mania.domain.models import StrategyConfig


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

    def test_override_loader_merges_profile_and_cli_values(self) -> None:
        profile = Path(__file__).resolve().parents[3] / "configs" / "strategies" / "mentor_default_5x30.yaml"
        args = Namespace(
            profile=str(profile),
            initial_capital=10000.0,
            thread_count=7,
            stop_sessions=30,
            take_profit_pct="5",
            take_profit_operator="gte",
            entry_drop_pct="2",
            stop_loss_pct="10",
            max_entries_per_session=2,
            sizing_mode="thread_compound",
            price_basis="raw_close_with_actions",
        )
        config = _load_strategy_config_with_overrides(args)
        self.assertEqual(config.thread_count, 7)
        self.assertEqual(str(config.take_profit_pct), "5")
        self.assertEqual(config.take_profit_operator, "gte")
        self.assertEqual(str(config.entry_drop_pct), "2")
        self.assertEqual(str(config.stop_loss_pct), "10")
        self.assertEqual(config.max_entries_per_session, 2)
        self.assertEqual(config.sizing_mode.value, "thread_compound")
        self.assertEqual(config.price_basis.value, "raw_close_with_actions")

    def test_serialize_config_includes_threshold_overrides(self) -> None:
        config = StrategyConfig.from_mapping(
            {
                "thread_count": 7,
                "stop_sessions": 30,
                "take_profit_pct": "5",
                "take_profit_operator": "gte",
                "entry_drop_pct": "2",
                "stop_loss_pct": "10",
                "max_entries_per_session": 2,
            }
        )
        payload = _serialize_config(config)
        self.assertEqual(payload["take_profit_pct"], "5")
        self.assertEqual(payload["take_profit_operator"], "gte")
        self.assertEqual(payload["entry_drop_pct"], "2")
        self.assertEqual(payload["stop_loss_pct"], "10")
        self.assertEqual(payload["max_entries_per_session"], 2)

    def test_parity_exit_code_fails_when_any_result_is_not_pass(self) -> None:
        self.assertEqual(
            _parity_exit_code(
                ParityResult("PASS", []),
                ParityResult("DATA_MISMATCH", ["x"]),
                ParityResult("PASS", []),
            ),
            1,
        )


if __name__ == "__main__":
    unittest.main()
