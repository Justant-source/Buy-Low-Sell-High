from __future__ import annotations

from datetime import date
from pathlib import Path
import unittest

from soxl_mania.domain.models import MarketBar, StrategyConfig
from soxl_mania.domain.money import D
from soxl_mania.reporting.mentor_matrix import build_mentor_matrix, default_reference_path, load_reference_fixture


def make_bar(year: int, month: int, day: int, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="SOXL",
        session_date=date(year, month, day),
        open=price,
        high=price,
        low=price,
        close=price,
        adj_close=price,
    )


class MentorMatrixTest(unittest.TestCase):
    def test_reference_fixture_loads_from_default_path(self) -> None:
        payload = load_reference_fixture()
        self.assertEqual(Path(default_reference_path()).name, "mentor_reference_matrix.yaml")
        self.assertEqual(payload["meta"]["source_image_sha256"], "d26f8c4c954f18f7f59eb721410d2224a58bf4be778f0941222d4c22f113c928")
        self.assertEqual(len(payload["benchmark"]["yearly"]), 14)
        self.assertEqual(len(payload["combos"]), 9)

    def test_build_mentor_matrix_returns_pass_when_reference_matches_actual(self) -> None:
        bars = [
            make_bar(2022, 1, 3, "10"),
            make_bar(2022, 1, 4, "9"),
            make_bar(2022, 1, 5, "11"),
            make_bar(2023, 1, 3, "10"),
            make_bar(2023, 1, 4, "9"),
            make_bar(2023, 1, 5, "11"),
            make_bar(2024, 1, 3, "10"),
            make_bar(2024, 1, 4, "9"),
            make_bar(2024, 1, 5, "11"),
        ]
        config = StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 1, "initial_capital": 1000})
        reference = {
            "meta": {"source_image_sha256": "test"},
            "benchmark": {
                "yearly": [
                    {"year": 2022, "price_change": "10.00->11.00"},
                    {"year": 2023, "price_change": "10.00->11.00"},
                    {"year": 2024, "price_change": "10.00->11.00"},
                ]
            },
            "combos": {
                "1x1": {
                    "yearly_returns_pct": {"2022": 22.2, "2023": 22.2, "2024": 22.2},
                    "stats_pct": {"stddev": 0.0, "avg_all": 22.2, "avg_5y": 22.2},
                    "simple_returns_pct": {"total": 46.7, "y3": 46.7},
                    "compound_returns_pct": {"total": 159.1, "y3": 159.1, "y1": 22.2},
                }
            },
            "selected_count_combos": {
                "1x1": {
                    "yearly_counts": {
                        "2022": {"take_profit": 1, "time_stop": 0},
                        "2023": {"take_profit": 1, "time_stop": 0},
                        "2024": {"take_profit": 1, "time_stop": 0},
                    },
                    "aggregate_rows": {
                        "avg_all": {"take_profit": 1.0, "time_stop": 0.0},
                        "avg_5y": {"take_profit": 1.0, "time_stop": 0.0},
                        "simple_total": {"take_profit": 3, "time_stop": 2},
                        "simple_y3": {"take_profit": 3, "time_stop": 2},
                        "compound_total": {"take_profit": 3, "time_stop": 2},
                        "compound_y3": {"take_profit": 3, "time_stop": 2},
                        "compound_y1": {"take_profit": 1, "time_stop": 0},
                    },
                }
            },
        }
        payload = build_mentor_matrix(
            bars,
            config,
            data_hash="synthetic-hash",
            reference=reference,
            combos=((1, 1),),
            windows={"total": (2022, 2024), "y3": (2022, 2024), "y1": (2024, 2024)},
            selected_count_combos=("1x1",),
        )
        self.assertEqual(payload["parity"]["status"], "PASS")
        self.assertEqual(payload["actual"]["combos"]["1x1"]["simple_returns_pct"]["total"], 46.7)
        self.assertEqual(payload["actual"]["selected_count_combos"]["1x1"]["aggregate_rows"]["compound_total"]["time_stop"], 2)

    def test_build_mentor_matrix_returns_data_mismatch_when_benchmark_boundaries_differ(self) -> None:
        bars = [
            make_bar(2024, 1, 3, "10"),
            make_bar(2024, 1, 4, "9"),
            make_bar(2024, 1, 5, "11"),
        ]
        config = StrategyConfig.from_mapping({"thread_count": 1, "stop_sessions": 1, "initial_capital": 1000})
        reference = {
            "meta": {"source_image_sha256": "test"},
            "benchmark": {"yearly": [{"year": 2024, "price_change": "10.00->12.00"}]},
            "combos": {},
            "selected_count_combos": {},
        }
        payload = build_mentor_matrix(
            bars,
            config,
            data_hash="synthetic-hash",
            reference=reference,
            combos=((1, 1),),
            windows={"total": (2024, 2024), "y1": (2024, 2024)},
            selected_count_combos=(),
        )
        self.assertEqual(payload["parity"]["status"], "DATA_MISMATCH")
        self.assertEqual(payload["parity"]["first_mismatch"]["section"], "benchmark.yearly")


if __name__ == "__main__":
    unittest.main()
