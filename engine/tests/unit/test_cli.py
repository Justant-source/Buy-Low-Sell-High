from __future__ import annotations

from argparse import Namespace
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from buy_low_sell_high.backtest.parity import ParityResult
from buy_low_sell_high.cli import _data_status, _load_strategy_config_with_overrides, _parity_exit_code, _serialize_config, default_market_data_csv
from buy_low_sell_high.data.providers.yahoo_provider import write_bars_to_csv
from buy_low_sell_high.data.sync import write_snapshot_manifest
from buy_low_sell_high.domain.models import MarketBar
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.domain.models import StrategyConfig


class CliDefaultsTest(unittest.TestCase):
    def test_default_market_data_csv_points_to_repo_snapshot(self) -> None:
        path = Path(default_market_data_csv())
        self.assertEqual(path.name, "soxl_daily_2011_present.csv")
        self.assertEqual(path.parent.name, "raw")
        self.assertEqual(path.parent.parent.name, "data")

    def test_default_market_data_csv_is_symbol_aware(self) -> None:
        path = Path(default_market_data_csv("TQQQ"))
        self.assertEqual(path.name, "tqqq_daily_2011_present.csv")

    def test_default_market_data_csv_uses_symbol_registry_filename(self) -> None:
        self.assertEqual(Path(default_market_data_csv("0193T0")).name, "0193t0_daily_2015_present.csv")
        self.assertEqual(Path(default_market_data_csv("000660")).name, "000660_daily_2015_present.csv")
        self.assertEqual(Path(default_market_data_csv("233740")).name, "233740_daily_2015_present.csv")
        self.assertEqual(Path(default_market_data_csv("462330")).name, "462330_daily_2023_present.csv")

    def test_override_loader_merges_profile_and_cli_values(self) -> None:
        profile = Path(__file__).resolve().parents[3] / "configs" / "strategies" / "soxl_default_5x30.yaml"
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

    def test_data_status_prefers_manifest_source_and_warnings(self) -> None:
        bars = [
            MarketBar(
                symbol="0193T0",
                session_date=__import__("datetime").date(2026, 5, 27),
                open=D("10"),
                high=D("11"),
                low=D("9"),
                close=D("10"),
                adj_close=D("10"),
                volume=100,
                source="naver",
            )
        ]
        with TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir) / "0193t0.csv"
            write_bars_to_csv(csv_path, bars)
            write_snapshot_manifest(
                csv_path,
                symbol="0193T0",
                source="naver_synthetic",
                bars=bars,
                data_hash="fixture-hash",
                warnings=["synthetic anchor warning"],
                errors=[],
            )
            stdout = StringIO()
            with redirect_stdout(stdout):
                exit_code = _data_status(Namespace(csv=str(csv_path), symbol="0193T0"))
            payload = json.loads(stdout.getvalue())
            self.assertEqual(exit_code, 0)
            self.assertEqual(payload["source"], "naver_synthetic")
            self.assertEqual(payload["warnings"], ["synthetic anchor warning"])

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
