from __future__ import annotations

import unittest

from buy_low_sell_high.automation.market_refresh import (
    ManifestSnapshot,
    MaterializationTarget,
    SyncTarget,
    classify_manifest_change,
    load_market_refresh_definition,
    resolve_impacted_materialization_targets,
    resolve_sync_batches,
)


class MarketRefreshTest(unittest.TestCase):
    def test_load_market_refresh_definition_includes_expected_market_metadata(self) -> None:
        kr = load_market_refresh_definition("kr")
        us = load_market_refresh_definition("us")

        self.assertEqual(kr.cron_timezone, "Asia/Seoul")
        self.assertEqual(kr.cron_schedule, "40 15 * * 1-5")
        self.assertIn("0193T0", [target.symbol for target in kr.sync_targets])
        self.assertEqual(us.cron_timezone, "America/New_York")
        self.assertIn("QQQ", [target.symbol for target in us.sync_targets])

    def test_resolve_sync_batches_keeps_underlying_before_synthetic_symbol(self) -> None:
        batches = resolve_sync_batches(
            (
                SyncTarget(symbol="000660"),
                SyncTarget(symbol="233740"),
                SyncTarget(symbol="0193T0", depends_on_symbols=("000660",)),
            )
        )

        self.assertEqual(batches[0], ("000660", "233740"))
        self.assertEqual(batches[1], ("0193T0",))

    def test_resolve_impacted_targets_uses_dependency_symbols(self) -> None:
        targets = (
            MaterializationTarget(
                workspace_id="soxl",
                profile_id="soxl_default_5x30",
                dependency_symbols=("SOXL", "QQQ"),
            ),
            MaterializationTarget(
                workspace_id="tqqq",
                profile_id="tqqq_default_5x30",
                dependency_symbols=("TQQQ",),
            ),
        )

        impacted = resolve_impacted_materialization_targets(targets, {"QQQ"})

        self.assertEqual([target.profile_id for target in impacted], ["soxl_default_5x30"])

    def test_manifest_change_is_unchanged_only_when_hash_and_end_match(self) -> None:
        before = ManifestSnapshot(
            data_hash="abc",
            end="2026-06-24",
            rows=1,
            source="yahoo_chart",
            manifest_path="/tmp/a.json",
        )
        unchanged = ManifestSnapshot(
            data_hash="abc",
            end="2026-06-24",
            rows=2,
            source="yahoo_chart",
            manifest_path="/tmp/b.json",
        )
        updated = ManifestSnapshot(
            data_hash="def",
            end="2026-06-25",
            rows=2,
            source="yahoo_chart",
            manifest_path="/tmp/b.json",
        )

        self.assertEqual(classify_manifest_change(before, unchanged), "UNCHANGED")
        self.assertEqual(classify_manifest_change(before, updated), "UPDATED")
        self.assertEqual(classify_manifest_change(None, updated), "UPDATED")
        self.assertEqual(classify_manifest_change(before, None), "FAILED")


if __name__ == "__main__":
    unittest.main()
