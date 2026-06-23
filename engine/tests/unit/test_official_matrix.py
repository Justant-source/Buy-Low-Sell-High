from __future__ import annotations

from datetime import date
from pathlib import Path
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.official_explorer import build_official_explorer
from buy_low_sell_high.reporting.official_matrix import (
    build_official_matrix,
    compare_to_reference,
    default_explorer_reference_path,
    default_reference_path,
    load_explorer_reference_fixture,
    load_reference_fixture,
)


def bar(year: int, month: int, day: int, close: str, adj_close: str | None = None, symbol: str = "SOXL") -> MarketBar:
    raw_price = D(close)
    adjusted_price = D(adj_close or close)
    return MarketBar(
        symbol=symbol,
        session_date=date(year, month, day),
        open=raw_price,
        high=raw_price + D("1"),
        low=raw_price - D("1"),
        close=raw_price,
        adj_close=adjusted_price,
    )


class OfficialMatrixTest(unittest.TestCase):
    def test_reference_fixture_paths_use_json_artifacts(self) -> None:
        self.assertEqual(Path(default_reference_path()).name, "official_reference_matrix.json")
        self.assertEqual(Path(default_explorer_reference_path()).name, "official_explorer_summary.json")

    def test_generated_reference_fixtures_load(self) -> None:
        matrix = load_reference_fixture()
        explorer = load_explorer_reference_fixture()
        self.assertIn("meta", matrix)
        self.assertIn("selection", matrix)
        self.assertIn("rankings", explorer)
        self.assertEqual(explorer["official_profile"]["combo_key"], "5x40")

    def test_build_official_explorer_marks_official_profile_when_catalog_matches(self) -> None:
        bars = [
            bar(2024, 1, 2, "10", "10.1"),
            bar(2024, 1, 3, "9", "9.2"),
            bar(2024, 1, 4, "11", "11.3"),
            bar(2025, 1, 2, "12", "12.4"),
            bar(2025, 1, 3, "11", "11.5"),
            bar(2025, 1, 6, "13", "13.8"),
        ]
        config = StrategyConfig.from_mapping(
            {
                "profile_id": "soxl_official_ddeolsao_pal_v1",
                "thread_count": 5,
                "stop_sessions": 40,
                "initial_capital": 1000,
                "price_basis": "adjusted_close",
                "execution_model": "ideal_same_close",
                "sizing_mode": "fixed_principal",
            }
        )
        payload = build_official_explorer(
            bars,
            config,
            data_hash="fixture-hash",
            catalog=(
                {
                    "strategy_id": "5x40",
                    "label": "5T / 40S",
                    "thread_count": 5,
                    "stop_sessions": 40,
                    "mentor_profiles": [],
                },
            ),
            catalog_id="official-fixture",
        )
        self.assertTrue(payload["matches_current_catalog_top"])
        self.assertEqual(payload["current_catalog_top"]["combo_key"], "5x40")
        self.assertEqual(payload["official_profile"]["config_hash"], config.config_hash())
        self.assertEqual(payload["meta"]["execution_model"], "ideal_same_close")
        self.assertEqual(payload["meta"]["price_basis"], "adjusted_close")

    def test_build_official_explorer_accepts_tqqq_official_profile(self) -> None:
        bars = [
            bar(2024, 1, 2, "10", "10.1", symbol="TQQQ"),
            bar(2024, 1, 3, "9", "9.2", symbol="TQQQ"),
            bar(2024, 1, 4, "11", "11.3", symbol="TQQQ"),
        ]
        config = StrategyConfig.from_mapping(
            {
                "profile_id": "tqqq_official_ddeolsao_pal_v1",
                "symbol": "TQQQ",
                "thread_count": 5,
                "stop_sessions": 40,
                "initial_capital": 1000,
                "price_basis": "adjusted_close",
                "execution_model": "ideal_same_close",
                "sizing_mode": "fixed_principal",
            }
        )
        payload = build_official_explorer(
            bars,
            config,
            data_hash="fixture-hash",
            catalog=(
                {
                    "strategy_id": "5x40",
                    "label": "5T / 40S",
                    "thread_count": 5,
                    "stop_sessions": 40,
                    "mentor_profiles": [],
                },
            ),
            catalog_id="official-fixture",
        )
        self.assertEqual(payload["meta"]["symbol"], "TQQQ")
        self.assertEqual(payload["meta"]["official_profile_id"], "tqqq_official_ddeolsao_pal_v1")
        self.assertEqual(payload["official_profile"]["profile_id"], "tqqq_official_ddeolsao_pal_v1")

    def test_build_official_explorer_accepts_koru_official_profile(self) -> None:
        bars = [
            bar(2024, 1, 2, "10", "10.1", symbol="KORU"),
            bar(2024, 1, 3, "9", "9.2", symbol="KORU"),
            bar(2024, 1, 4, "11", "11.3", symbol="KORU"),
        ]
        config = StrategyConfig.from_mapping(
            {
                "profile_id": "koru_official_ddeolsao_pal_v1",
                "symbol": "KORU",
                "thread_count": 5,
                "stop_sessions": 40,
                "initial_capital": 1000,
                "price_basis": "adjusted_close",
                "execution_model": "ideal_same_close",
                "sizing_mode": "fixed_principal",
            }
        )
        payload = build_official_explorer(
            bars,
            config,
            data_hash="fixture-hash",
            catalog=(
                {
                    "strategy_id": "5x40",
                    "label": "5T / 40S",
                    "thread_count": 5,
                    "stop_sessions": 40,
                    "mentor_profiles": [],
                },
            ),
            catalog_id="official-fixture",
        )
        self.assertEqual(payload["meta"]["symbol"], "KORU")
        self.assertEqual(payload["meta"]["official_profile_id"], "koru_official_ddeolsao_pal_v1")
        self.assertEqual(payload["official_profile"]["profile_id"], "koru_official_ddeolsao_pal_v1")

    def test_build_official_matrix_uses_dynamic_windows_and_selected_combo(self) -> None:
        bars = [
            bar(2024, 1, 2, "10", "10.1"),
            bar(2024, 1, 3, "9", "9.2"),
            bar(2024, 1, 4, "11", "11.3"),
            bar(2025, 1, 2, "12", "12.4"),
            bar(2025, 1, 3, "11", "11.5"),
            bar(2025, 1, 6, "13", "13.8"),
        ]
        config = StrategyConfig.from_mapping(
            {
                "profile_id": "soxl_official_ddeolsao_pal_v1",
                "thread_count": 5,
                "stop_sessions": 40,
                "initial_capital": 1000,
                "price_basis": "adjusted_close",
                "execution_model": "ideal_same_close",
                "sizing_mode": "fixed_principal",
            }
        )
        payload = build_official_matrix(bars, config, data_hash="fixture-hash", combos=((5, 40),))
        self.assertEqual(payload["meta"]["official_combo_key"], "5x40")
        self.assertEqual(payload["meta"]["windows"]["total"], {"start_year": 2024, "end_year": 2025})
        self.assertEqual(payload["meta"]["windows"]["y1"], {"start_year": 2025, "end_year": 2025})
        self.assertIn("5x40", payload["combos"])
        self.assertIn("5x40", payload["selected_count_combos"])
        self.assertEqual(payload["selection"]["official_profile"]["combo_key"], "5x40")

    def test_compare_to_reference_returns_first_nested_mismatch(self) -> None:
        result = compare_to_reference({"meta": {"a": 1}}, {"meta": {"a": 2}})
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["first_mismatch"]["path"], "meta.a")
        self.assertEqual(result["first_mismatch"]["expected"], 2)
        self.assertEqual(result["first_mismatch"]["actual"], 1)


if __name__ == "__main__":
    unittest.main()
