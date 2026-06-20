from __future__ import annotations

from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from soxl_mania.data.normalize import normalize_bars
from soxl_mania.data.providers.csv_provider import CsvMarketDataProvider
from soxl_mania.data.providers.investing_provider import InvestingMarketDataProvider
from soxl_mania.data.providers.stooq_provider import StooqMarketDataProvider
from soxl_mania.data.providers.yahoo_provider import YahooMarketDataProvider
from soxl_mania.data.quality import apply_split_to_position, compute_data_hash, summarize_import, validate_bars
from soxl_mania.data.sync import snapshot_manifest_path, write_snapshot_manifest
from soxl_mania.domain.models import MarketBar
from soxl_mania.domain.money import D


FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample_soxl.csv"


def yahoo_payload(session_date: date, close: str) -> dict:
    timestamp = int(
        __import__("datetime").datetime(
            session_date.year,
            session_date.month,
            session_date.day,
            tzinfo=__import__("datetime").timezone.utc,
        ).timestamp()
    )
    value = float(close)
    return {
        "chart": {
            "result": [
                {
                    "timestamp": [timestamp],
                    "indicators": {
                        "quote": [
                            {
                                "open": [value],
                                "high": [value],
                                "low": [value],
                                "close": [value],
                                "volume": [100],
                            }
                        ],
                        "adjclose": [{"adjclose": [value]}],
                    },
                }
            ],
            "error": None,
        }
    }


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

    def test_import_summary_warns_when_adjusted_close_is_raw_equivalent(self) -> None:
        bars = []
        for day in range(1, 202):
            bars.append(
                MarketBar(
                    symbol="SOXL",
                    session_date=__import__("datetime").date(2024, 1, 1) + __import__("datetime").timedelta(days=day),
                    open=D("10"),
                    high=D("11"),
                    low=D("9"),
                    close=D("10"),
                    adj_close=D("10"),
                    volume=100,
                    source="investing",
                )
            )
        report = summarize_import("SOXL", "investing", bars)
        self.assertIn("Adjusted-close basis appears unavailable: adj_close mirrors close for all rows", report.warnings)

    def test_snapshot_manifest_path_uses_manifests_dir_for_repo_raw_snapshot(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        manifest_path = snapshot_manifest_path(repo_root / "data" / "raw" / "soxl_daily_2011_present.csv")
        self.assertEqual(manifest_path, repo_root / "data" / "manifests" / "soxl_daily_2011_present.json")

    def test_write_snapshot_manifest_persists_metadata_for_custom_output(self) -> None:
        bars = [
            MarketBar(
                symbol="SOXL",
                session_date=date(2024, 1, 2),
                open=D("10"),
                high=D("11"),
                low=D("9"),
                close=D("10"),
                adj_close=D("10.5"),
                volume=100,
                source="yahoo_chart",
            ),
            MarketBar(
                symbol="SOXL",
                session_date=date(2024, 1, 3),
                open=D("11"),
                high=D("12"),
                low=D("10"),
                close=D("11"),
                adj_close=D("11.5"),
                volume=200,
                source="yahoo_chart",
            ),
        ]
        with TemporaryDirectory() as temp_dir:
            output_csv = Path(temp_dir) / "soxl.csv"
            manifest_path = write_snapshot_manifest(
                output_csv,
                symbol="SOXL",
                source="yahoo_chart",
                bars=bars,
                data_hash="fixture-hash",
                warnings=["cached"],
                errors=["query1: 429"],
            )
            self.assertEqual(manifest_path, output_csv.with_suffix(".manifest.json"))
            payload = __import__("json").loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["symbol"], "SOXL")
            self.assertEqual(payload["source"], "yahoo_chart")
            self.assertEqual(payload["rows"], 2)
            self.assertEqual(payload["start"], "2024-01-02")
            self.assertEqual(payload["end"], "2024-01-03")
            self.assertEqual(payload["data_hash"], "fixture-hash")
            self.assertEqual(payload["warnings"], ["cached"])
            self.assertEqual(payload["errors"], ["query1: 429"])
            self.assertEqual(payload["output_csv"], str(output_csv.resolve()))

    def test_yahoo_provider_falls_back_to_query2(self) -> None:
        payload = yahoo_payload(date(2024, 1, 1), "10")

        class Response:
            def __enter__(self) -> "Response":
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

            def read(self) -> bytes:
                import json

                return json.dumps(payload).encode("utf-8")

        side_effects = [
            HTTPError("https://query1.finance.yahoo.com", 429, "Too Many Requests", hdrs=None, fp=None),
            Response(),
        ]

        with patch("urllib.request.urlopen", side_effect=side_effects) as mocked:
            bars = YahooMarketDataProvider(sleep_seconds=0).load_bars("SOXL", start_date="2024-01-01", end_date="2024-01-02")
        self.assertEqual(len(bars), 1)
        self.assertEqual(bars[0].close, D("10"))
        self.assertEqual(mocked.call_count, 2)

    def test_yahoo_provider_reuses_cached_chunk_after_http_errors(self) -> None:
        payload = yahoo_payload(date(2024, 1, 2), "11")

        class Response:
            def __enter__(self) -> "Response":
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

            def read(self) -> bytes:
                import json

                return json.dumps(payload).encode("utf-8")

        with TemporaryDirectory() as temp_dir:
            provider = YahooMarketDataProvider(cache_dir=temp_dir, sleep_seconds=0)
            with patch("urllib.request.urlopen", return_value=Response()):
                first = provider.load_bars("SOXL", start_date="2024-01-01", end_date="2024-01-03")
            self.assertEqual(len(first), 1)

            side_effects = [
                HTTPError("https://query1.finance.yahoo.com", 429, "Too Many Requests", hdrs=None, fp=None),
                HTTPError("https://query2.finance.yahoo.com", 429, "Too Many Requests", hdrs=None, fp=None),
            ]
            with patch("urllib.request.urlopen", side_effect=side_effects) as mocked:
                second = provider.load_bars("SOXL", start_date="2024-01-01", end_date="2024-01-03")
            self.assertEqual(len(second), 1)
            self.assertEqual(second[0].close, D("11"))
            self.assertEqual(mocked.call_count, 2)

    def test_yahoo_provider_splits_large_window_into_chunks(self) -> None:
        payloads = [
            yahoo_payload(date(2011, 1, 3), "10"),
            yahoo_payload(date(2016, 1, 4), "11"),
        ]

        class Response:
            def __init__(self, payload: dict) -> None:
                self.payload = payload

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

            def read(self) -> bytes:
                import json

                return json.dumps(self.payload).encode("utf-8")

        with TemporaryDirectory() as temp_dir:
            provider = YahooMarketDataProvider(cache_dir=temp_dir, chunk_years=5, sleep_seconds=0)
            with patch("urllib.request.urlopen", side_effect=[Response(payloads[0]), Response(payloads[1])]) as mocked:
                bars = provider.load_bars("SOXL", start_date="2011-01-01", end_date="2021-01-01")
            self.assertEqual([bar.session_date.isoformat() for bar in bars], ["2011-01-03", "2016-01-04"])
            self.assertEqual(mocked.call_count, 2)

    def test_stooq_history_html_is_parsed(self) -> None:
        html = """
        <table>
          <thead><tr><td>No.</td><td>Date</td><td>Open</td><td>High</td><td>Low</td><td>Close</td><td>Change</td><td>Change</td><td>Volume</td></tr></thead>
          <tbody>
            <tr><td align=center id=t03>2</td><td nowrap>18 Jun 2026</td><td>266.035</td><td>286.1526</td><td>265</td><td>278.8</td><td id=c1>+19.22%</td><td id=c1>+44.9400</td><td>48,449,652</td></tr>
            <tr><td align=center id=t03>1</td><td nowrap>17 Jun 2026</td><td>247.42</td><td>259.79</td><td>233.3</td><td>233.86</td><td id=c1>+3.39%</td><td id=c1>+7.6700</td><td>49,127,337</td></tr>
          </tbody>
        </table>
        """
        bars = StooqMarketDataProvider()._parse_history_html("SOXL", html)
        self.assertEqual(len(bars), 2)
        self.assertEqual(str(bars[0].close), "278.8")
        self.assertEqual(bars[1].volume, 49127337)

    def test_stooq_last_page_is_detected(self) -> None:
        html = '<a href=q/d/?s=soxl.us&i=d&f=20110101&t=20260618&l=2>></a> | <a href=q/d/?s=soxl.us&i=d&f=20110101&t=20260618&l=98>>>></a>'
        self.assertEqual(StooqMarketDataProvider()._parse_last_page(html), 98)

    def test_investing_payload_is_parsed(self) -> None:
        payload = {
            "data": [
                {
                    "rowDateTimestamp": "2026-06-18T00:00:00Z",
                    "last_openRaw": "266.03500366210938",
                    "last_maxRaw": "286.11999511718750",
                    "last_minRaw": "265.20010375976562",
                    "last_closeRaw": "279.23999023437500",
                    "volumeRaw": 46979584,
                },
                {
                    "rowDateTimestamp": "2020-07-04T00:00:00Z",
                    "last_openRaw": "187.05000305175781",
                    "last_maxRaw": "187.05000305175781",
                    "last_minRaw": "187.05000305175781",
                    "last_closeRaw": "187.05000305175781",
                    "volumeRaw": 0,
                }
            ]
        }
        bars = InvestingMarketDataProvider()._parse_payload("SOXL", payload)
        self.assertEqual(len(bars), 1)
        self.assertEqual(str(bars[0].close), "279.23999023437500")
        self.assertEqual(bars[0].volume, 46979584)


if __name__ == "__main__":
    unittest.main()
