from __future__ import annotations

from pathlib import Path
import unittest

from soxl_mania.cli import bootstrap_check


class BootstrapSmokeTest(unittest.TestCase):
    def test_bootstrap_check_passes(self) -> None:
        self.assertEqual(bootstrap_check(), 0)

    def test_repository_layout_exists(self) -> None:
        root = Path(__file__).resolve().parents[3]
        self.assertTrue((root / "engine/src/soxl_mania").exists())
        self.assertTrue((root / "dashboard/public").exists())


if __name__ == "__main__":
    unittest.main()

