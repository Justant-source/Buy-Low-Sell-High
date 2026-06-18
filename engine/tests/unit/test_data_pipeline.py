from __future__ import annotations

from pathlib import Path
import unittest

from soxl_mania.data.normalize import normalize_bars
from soxl_mania.data.providers.csv_provider import CsvMarketDataProvider
from soxl_mania.data.quality import apply_split_to_position, compute_data_hash, summarize_import, validate_bars
from soxl_mania.domain.money import D


FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"


class DataPipelineTest(unittest.TestCase):
    def test_csv_provider_loads_bars(self) -> None:
        bars = CsvMarketDataProvider(FIXTURE).load_bars("SOXL")
        self.assertEqual(len(bars), 5)
        self.assertEqual(str(bars[0].close), "10")

    def test_validate_bars_accepts_fixture(self) -> None:
        bars = CsvMarketDataProvider(FIXTURE).load_bars("SOXL")
        self.assertEqual(validate_bars(bars), [])

    def test_duplicate_dates_rejected(self) -> None:
        bars = CsvMarketDataProvider(FIXTURE).load_bars("SOXL")
        with self.assertRaises(ValueError):
            normalize_bars([bars[0], bars[0]])

    def test_split_adjustment_is_inverse_price(self) -> None:
        shares, entry_price = apply_split_to_position(D("10"), D("100"), D("2"))
        self.assertEqual(shares, D("20"))
        self.assertEqual(entry_price, D("50"))

    def test_same_input_has_same_hash(self) -> None:
        bars = CsvMarketDataProvider(FIXTURE).load_bars("SOXL")
        self.assertEqual(compute_data_hash(bars), compute_data_hash(bars))

    def test_one_row_change_changes_hash(self) -> None:
        bars = CsvMarketDataProvider(FIXTURE).load_bars("SOXL")
        altered = list(bars)
        altered[-1] = altered[-1].__class__(**{**altered[-1].__dict__, "close": D("12"), "adj_close": D("12")})
        self.assertNotEqual(compute_data_hash(bars), compute_data_hash(altered))

    def test_import_summary_counts_rows(self) -> None:
        bars = CsvMarketDataProvider(FIXTURE).load_bars("SOXL")
        report = summarize_import("SOXL", "csv", bars)
        self.assertEqual(report.rows, 5)
        self.assertTrue(report.data_hash)


if __name__ == "__main__":
    unittest.main()

