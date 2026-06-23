from __future__ import annotations

from argparse import Namespace
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest
from unittest.mock import patch

from buy_low_sell_high.backtest.parity import ParityResult
from buy_low_sell_high.cli import (
    _backtest_parameter_sweep,
    _backtest_strategy_detail,
    _backtest_regime_walk_forward,
    _backtest_thread_timeline,
    _data_status,
    _load_strategy_config_with_overrides,
    _parity_exit_code,
    _serialize_config,
    default_market_data_csv,
)
from buy_low_sell_high.data.providers.yahoo_provider import write_bars_to_csv
from buy_low_sell_high.data.sync import write_snapshot_manifest
from buy_low_sell_high.domain.models import MarketBar
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.domain.models import StrategyConfig


def _daily_return_pct(payload: dict[str, object]) -> float:
    daily = payload["daily"]
    start = float(daily[0]["total_equity"])
    end = float(daily[-1]["total_equity"])
    return 0.0 if start == 0 else round(((end - start) / start) * 100, 2)


class CliDefaultsTest(unittest.TestCase):
    def test_strategy_detail_cli_respects_slice_boundaries(self) -> None:
        profile = Path(__file__).resolve().parents[3] / "configs" / "strategies" / "soxl_official_ddeolsao_pal_v1.yaml"
        csv_path = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"
        stdout = StringIO()
        with redirect_stdout(stdout):
            exit_code = _backtest_strategy_detail(
                Namespace(
                    profile=str(profile),
                    csv=str(csv_path),
                    symbol="SOXL",
                    initial_capital=10000.0,
                    strategy_id="t5-s40-buy-2-sell+0",
                    slice_start="2024-01-03",
                    slice_end="2024-01-04",
                    execution_model="ideal_same_close",
                    price_basis="adjusted_close",
                )
            )
        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["meta"]["strategy_id"], "t5-s40-buy-2-sell+0")
        self.assertEqual(payload["meta"]["period_start"], "2024-01-03")
        self.assertEqual(payload["meta"]["period_end"], "2024-01-04")
        self.assertEqual(payload["daily"][0]["session_date"], "2024-01-03")
        self.assertEqual(payload["daily"][-1]["session_date"], "2024-01-04")
        self.assertEqual(float(payload["metrics"]["total_return_pct"]), _daily_return_pct(payload))

    def test_thread_timeline_cli_respects_slice_boundaries(self) -> None:
        profile = Path(__file__).resolve().parents[3] / "configs" / "strategies" / "soxl_official_ddeolsao_pal_v1.yaml"
        csv_path = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"
        stdout = StringIO()
        with redirect_stdout(stdout):
            exit_code = _backtest_thread_timeline(
                Namespace(
                    profile=str(profile),
                    csv=str(csv_path),
                    symbol="SOXL",
                    initial_capital=10000.0,
                    strategy_id="t5-s40-buy-2-sell+0",
                    catalog_id="core_profiles_v2",
                    slice_start="2024-01-03",
                    slice_end="2024-01-04",
                    execution_model="ideal_same_close",
                    price_basis="adjusted_close",
                )
            )
        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["meta"]["period_start"], "2024-01-03")
        self.assertEqual(payload["meta"]["period_end"], "2024-01-04")
        self.assertEqual(payload["meta"]["commission_bps"], "25")
        self.assertEqual(payload["meta"]["transaction_tax_bps"], "0")
        self.assertTrue(all("2024-01-03" <= row["session_date"] <= "2024-01-04" for row in payload["sessions"]))

    def test_regime_walk_forward_cli_emits_report_payload(self) -> None:
        profile = Path(__file__).resolve().parents[3] / "configs" / "strategies" / "soxl_official_ddeolsao_pal_v1.yaml"
        csv_path = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"
        stdout = StringIO()
        with (
            patch(
                "buy_low_sell_high.cli.build_regime_walk_forward_report",
                return_value={"meta": {"symbol": "SOXL"}, "decision": {"recommendation": "defer_verdict_until_semantic_fix"}},
            ),
            redirect_stdout(stdout),
        ):
            exit_code = _backtest_regime_walk_forward(
                Namespace(
                    profile=str(profile),
                    csv=str(csv_path),
                    symbol="SOXL",
                    initial_capital=10000.0,
                    max_workers=2,
                    regime_symbol=None,
                    regime_csv_path=None,
                )
            )
        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["meta"]["symbol"], "SOXL")
        self.assertEqual(payload["decision"]["recommendation"], "defer_verdict_until_semantic_fix")

    def test_parameter_sweep_cli_dry_run_reports_execution_plan(self) -> None:
        profile = Path(__file__).resolve().parents[3] / "configs" / "strategies" / "soxl_official_ddeolsao_pal_v1.yaml"
        csv_path = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"
        stdout = StringIO()
        with redirect_stdout(stdout):
            exit_code = _backtest_parameter_sweep(
                Namespace(
                    profile=str(profile),
                    csv=str(csv_path),
                    symbol="SOXL",
                    initial_capital=10000.0,
                    sweep_id="core4_v4",
                    execution_model="next_open",
                    price_basis="adjusted_close",
                    max_workers=4,
                    chunk_size=9,
                    dry_run=True,
                )
            )
        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["meta"]["symbol"], "SOXL")
        self.assertEqual(payload["meta"]["worker_count"], 4)
        self.assertEqual(payload["meta"]["chunk_size"], 9)
        self.assertEqual(payload["plan"]["requested_max_workers"], 4)
        self.assertEqual(payload["plan"]["chunk_size"], 9)
        self.assertEqual(payload["plan"]["parameter_keys"], ["thread_count", "stop_sessions", "buy_pct", "sell_pct"])

    def test_default_market_data_csv_points_to_repo_snapshot(self) -> None:
        path = Path(default_market_data_csv())
        self.assertEqual(path.name, "soxl_daily_2011_present.csv")
        self.assertEqual(path.parent.name, "raw")
        self.assertEqual(path.parent.parent.name, "data")

    def test_default_market_data_csv_is_symbol_aware(self) -> None:
        path = Path(default_market_data_csv("TQQQ"))
        self.assertEqual(path.name, "tqqq_daily_2011_present.csv")

    def test_default_market_data_csv_uses_symbol_registry_filename(self) -> None:
        self.assertEqual(Path(default_market_data_csv("QQQ")).name, "qqq_daily_2011_present.csv")
        self.assertEqual(Path(default_market_data_csv("KORU")).name, "koru_daily_2013_present.csv")
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
        self.assertEqual(payload["commission_bps"], "25")
        self.assertEqual(payload["transaction_tax_bps"], "0")

    def test_serialize_config_includes_regime_fields(self) -> None:
        config = StrategyConfig.from_mapping(
            {
                "symbol": "SOXL",
                "thread_count": 5,
                "stop_sessions": 30,
                "regime_enabled": True,
                "regime_symbol": "QQQ",
                "regime_base_stop_sessions": 30,
                "regime_bull_stop_sessions": 40,
                "regime_bull_buy_pct": "-2",
                "regime_bull_sell_pct": "3",
                "regime_bear_stop_sessions": 10,
                "regime_bear_buy_pct": "-5",
                "regime_bear_sell_pct": "1",
            }
        )
        payload = _serialize_config(config)
        self.assertEqual(payload["regime_enabled"], True)
        self.assertEqual(payload["regime_symbol"], "QQQ")
        self.assertEqual(payload["regime_bull_stop_sessions"], 40)
        self.assertEqual(payload["regime_bear_buy_pct"], "-5")
        self.assertTrue(payload["regime_config_hash"])

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
