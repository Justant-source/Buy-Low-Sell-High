from __future__ import annotations

from datetime import date
import unittest

from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D
from buy_low_sell_high.reporting.regime_walk_forward import (
    _complete_calendar_years,
    _decision_payload,
    _fold_verdict,
    _neutral_doc_semantics,
    _walk_forward_windows,
    build_regime_audit_report,
)


def bar(year: int, month: int, day: int, close: str) -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol="SOXL",
        session_date=date(year, month, day),
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
        source="test",
    )


class RegimeWalkForwardTest(unittest.TestCase):
    def test_complete_calendar_years_exclude_partial_terminal_year(self) -> None:
        bars = [
            bar(2023, 1, 3, "10"),
            bar(2023, 12, 29, "11"),
            bar(2024, 1, 2, "12"),
            bar(2024, 12, 31, "13"),
            bar(2025, 1, 2, "14"),
            bar(2025, 6, 20, "15"),
        ]
        self.assertEqual(_complete_calendar_years(bars), [2023, 2024])

    def test_walk_forward_windows_require_consecutive_years(self) -> None:
        windows = _walk_forward_windows([2011, 2012, 2013, 2014, 2016, 2017])
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0].train_start_year, 2011)
        self.assertEqual(windows[0].train_end_year, 2013)
        self.assertEqual(windows[0].test_year, 2014)

    def test_neutral_doc_semantics_detect_conflict(self) -> None:
        positions = _neutral_doc_semantics(
            {
                "docs/90-adr/0007-soxl-three-state-regime.md": "그 사이 → `neutral`",
                "docs/70-policy/ddeolsao-pal-ssot.md": "neutral 주간은 직전 regime을 유지한다.",
            }
        )
        self.assertEqual(
            positions,
            {
                "explicit_neutral": ["docs/90-adr/0007-soxl-three-state-regime.md"],
                "carry_forward": ["docs/70-policy/ddeolsao-pal-ssot.md"],
            },
        )

    def test_fold_verdict_uses_return_and_mdd_gate(self) -> None:
        self.assertEqual(
            _fold_verdict(
                delta_cagr=D("1"),
                delta_return=D("-1"),
                delta_mdd=D("-2.5"),
            ),
            "WIN",
        )
        self.assertEqual(
            _fold_verdict(
                delta_cagr=D("-1"),
                delta_return=D("-2"),
                delta_mdd=D("6"),
            ),
            "RISK_WIN",
        )
        self.assertEqual(
            _fold_verdict(
                delta_cagr=D("-1"),
                delta_return=D("-2"),
                delta_mdd=D("-4"),
            ),
            "LOSS",
        )

    def test_decision_defers_when_audit_is_blocking(self) -> None:
        payload = _decision_payload(
            {
                "classification": "documentation_conflict",
                "blocking": True,
                "status_counts": {"PASS": 4, "FAIL": 0, "AMBIGUOUS": 1},
                "items": [],
            },
            [
                {
                    "decision_focus_oos": True,
                    "delta_oos": {
                        "cagr_pct": 1.0,
                        "total_return_pct": 2.0,
                        "max_drawdown_pct": 0.5,
                    },
                    "verdict": "WIN",
                }
            ],
            {
                "off_best": {"metrics": {"cagr_pct": "10", "total_return_pct": "100", "max_drawdown_pct": "-50"}},
                "on_best": {"metrics": {"cagr_pct": "12", "total_return_pct": "120", "max_drawdown_pct": "-45"}},
            },
        )
        self.assertEqual(payload["recommendation"], "defer_verdict_until_semantic_fix")
        self.assertEqual(payload["gate_results"]["audit_blocking"], True)

    def test_build_regime_audit_report_flags_current_doc_conflict(self) -> None:
        audit = build_regime_audit_report(
            StrategyConfig.from_mapping(
                {
                    "symbol": "SOXL",
                    "thread_count": 5,
                    "stop_sessions": 40,
                    "regime_base_stop_sessions": 40,
                    "regime_bull_stop_sessions": 30,
                    "regime_bear_stop_sessions": 40,
                }
            )
        )
        self.assertEqual(audit["classification"], "documentation_conflict")
        self.assertEqual(audit["status_counts"]["FAIL"], 0)
        self.assertGreaterEqual(audit["status_counts"]["AMBIGUOUS"], 1)


if __name__ == "__main__":
    unittest.main()
