from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from buy_low_sell_high.backtest.engine import run_backtest
from buy_low_sell_high.backtest.regime import build_regime_context
from buy_low_sell_high.data.providers.yahoo_provider import write_bars_to_csv
from buy_low_sell_high.domain.models import MarketBar, StrategyConfig
from buy_low_sell_high.domain.money import D


def daily_bar(session_date: date, close: str, *, symbol: str = "SOXL") -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol=symbol,
        session_date=session_date,
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
        source="test",
    )


def weekly_friday(start_friday: date, week_offset: int, close: str, *, symbol: str = "QQQ") -> MarketBar:
    return daily_bar(start_friday + timedelta(weeks=week_offset), close, symbol=symbol)


class RegimeTest(unittest.TestCase):
    def _write_regime_csv(self, bars: list[MarketBar]) -> str:
        temp_dir = TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        csv_path = Path(temp_dir.name) / "qqq.csv"
        write_bars_to_csv(csv_path, bars)
        return str(csv_path)

    def _make_regime_config(self, regime_csv_path: str, **overrides: object) -> StrategyConfig:
        return StrategyConfig.from_mapping(
            {
                "symbol": "SOXL",
                "thread_count": 1,
                "stop_sessions": 5,
                "initial_capital": 1000,
                "execution_model": "ideal_same_close",
                "price_basis": "adjusted_close",
                "sizing_mode": "fixed_principal",
                "commission_bps": "0",
                "transaction_tax_bps": "0",
                "slippage_bps": "0",
                "regime_enabled": True,
                "regime_symbol": "QQQ",
                "regime_csv_path": regime_csv_path,
                "regime_base_stop_sessions": 5,
                "regime_base_buy_pct": "0",
                "regime_base_sell_pct": "99",
                "regime_bull_stop_sessions": 3,
                "regime_bull_buy_pct": "0",
                "regime_bull_sell_pct": "99",
                "regime_bear_stop_sessions": 1,
                "regime_bear_buy_pct": "0",
                "regime_bear_sell_pct": "99",
                **overrides,
            }
        )

    def test_build_regime_context_marks_bear_week_from_high_rsi_rollover(self) -> None:
        start_friday = date(2024, 1, 5)
        regime_bars = [
            weekly_friday(start_friday, index, str(100 + index))
            for index in range(15)
        ] + [
            weekly_friday(start_friday, 15, "113")
        ]
        primary_week_start = regime_bars[-1].session_date + timedelta(days=3)
        primary_bars = [
            daily_bar(primary_week_start + timedelta(days=offset), value)
            for offset, value in enumerate(("10", "9", "8"))
        ]
        config = self._make_regime_config(self._write_regime_csv(regime_bars))
        regime_context = build_regime_context(primary_bars, config, regime_bars=regime_bars, regime_data_hash="fixture")

        self.assertTrue(regime_context.enabled)
        self.assertEqual(regime_context.parameters_for_session(primary_bars[0].session_date).regime, "bear")

    def test_run_backtest_uses_bear_stop_for_entries_opened_in_bear_week(self) -> None:
        start_friday = date(2024, 1, 5)
        regime_bars = [
            weekly_friday(start_friday, index, str(100 + index))
            for index in range(15)
        ] + [
            weekly_friday(start_friday, 15, "113")
        ]
        primary_week_start = regime_bars[-1].session_date + timedelta(days=3)
        primary_bars = [
            daily_bar(primary_week_start, "10"),
            daily_bar(primary_week_start + timedelta(days=1), "9"),
            daily_bar(primary_week_start + timedelta(days=2), "8"),
        ]
        config = self._make_regime_config(self._write_regime_csv(regime_bars))

        run = run_backtest(primary_bars, config)

        self.assertEqual(run.daily[0].applied_regime, "bear")
        self.assertEqual(run.trades[0].entry_regime, "bear")
        self.assertEqual(run.trades[0].entry_stop_sessions, 1)
        self.assertEqual(run.trades[0].holding_sessions, 1)

    def test_run_backtest_uses_bull_stop_for_entries_opened_in_bull_week(self) -> None:
        start_friday = date(2024, 1, 5)
        regime_bars = [
            weekly_friday(start_friday, index, str(100 - index))
            for index in range(15)
        ] + [
            weekly_friday(start_friday, 15, "87")
        ]
        primary_week_start = regime_bars[-1].session_date + timedelta(days=3)
        primary_bars = [
            daily_bar(primary_week_start, "10"),
            daily_bar(primary_week_start + timedelta(days=1), "9"),
            daily_bar(primary_week_start + timedelta(days=2), "8"),
            daily_bar(primary_week_start + timedelta(days=3), "8"),
            daily_bar(primary_week_start + timedelta(days=4), "8"),
        ]
        config = self._make_regime_config(self._write_regime_csv(regime_bars))

        run = run_backtest(primary_bars, config)

        self.assertEqual(run.daily[0].applied_regime, "bull")
        self.assertEqual(run.trades[0].entry_regime, "bull")
        self.assertEqual(run.trades[0].entry_stop_sessions, 3)
        self.assertEqual(run.trades[0].holding_sessions, 3)


if __name__ == "__main__":
    unittest.main()
