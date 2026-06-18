from __future__ import annotations

from pathlib import Path
import unittest

from soxl_mania.backtest.parity import check_data_parity, load_reference_fixture
from soxl_mania.data.providers.csv_provider import CsvMarketDataProvider


FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "mentor_reference_2011_2024.json"
CSV_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"


class ParityTest(unittest.TestCase):
    def test_reference_fixture_loads(self) -> None:
        payload = load_reference_fixture(FIXTURE)
        self.assertEqual(payload["source_image_sha256"], "d26f8c4c954f18f7f59eb721410d2224a58bf4be778f0941222d4c22f113c928")

    def test_sample_data_mismatch_is_explicit(self) -> None:
        bars = CsvMarketDataProvider(CSV_FIXTURE).load_bars("SOXL")
        result = check_data_parity(bars, load_reference_fixture(FIXTURE))
        self.assertEqual(result.status, "DATA_MISMATCH")


if __name__ == "__main__":
    unittest.main()

