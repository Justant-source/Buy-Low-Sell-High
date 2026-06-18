from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from math import sqrt

from ..domain.models import BacktestRun, DailySnapshot, Trade
from ..domain.money import D, ZERO, quantize_money


def _series_returns(daily: list[DailySnapshot]) -> list[float]:
    if len(daily) < 2:
        return []
    values: list[float] = []
    for previous, current in zip(daily, daily[1:]):
        if previous.total_equity == ZERO:
            continue
        values.append(float((current.total_equity - previous.total_equity) / previous.total_equity))
    return values


def _stddev(values: list[float]) -> Decimal:
    if not values:
        return ZERO
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return D(str(sqrt(variance) * 100))


def compute_metrics(run: BacktestRun) -> dict[str, Decimal | int | str]:
    daily = run.daily
    if not daily:
        return {"total_return_pct": ZERO}
    start = daily[0].total_equity
    end = daily[-1].total_equity
    total_return_pct = ZERO if start == ZERO else quantize_money(((end - start) / start) * D("100"))
    max_drawdown = min((snapshot.drawdown for snapshot in daily), default=ZERO)
    returns = _series_returns(daily)
    volatility = _stddev(returns)
    tp = sum(1 for trade in run.trades if trade.close_reason and trade.close_reason.value == "TAKE_PROFIT")
    ts = sum(1 for trade in run.trades if trade.close_reason and trade.close_reason.value == "TIME_STOP")
    return {
        "total_return_pct": total_return_pct,
        "max_drawdown_pct": quantize_money(max_drawdown * D("100")),
        "volatility_pct": quantize_money(volatility),
        "trade_count": len(run.trades),
        "take_profit_count": tp,
        "time_stop_count": ts,
    }


def yearly_summary(run: BacktestRun) -> dict[int, dict[str, Decimal | int | str]]:
    by_year: dict[int, list[DailySnapshot]] = defaultdict(list)
    for snapshot in run.daily:
        by_year[snapshot.session_date.year].append(snapshot)
    summary: dict[int, dict[str, Decimal | int | str]] = {}
    for year, snapshots in by_year.items():
        start = snapshots[0].total_equity
        end = snapshots[-1].total_equity
        return_pct = ZERO if start == ZERO else quantize_money(((end - start) / start) * D("100"))
        summary[year] = {
            "start_equity": quantize_money(start),
            "end_equity": quantize_money(end),
            "return_pct": return_pct,
            "mdd_pct": quantize_money(min(snapshot.drawdown for snapshot in snapshots) * D("100")),
            "take_profit_count": sum(1 for trade in run.trades if trade.fill_exit_date and trade.fill_exit_date.year == year and trade.close_reason and trade.close_reason.value == "TAKE_PROFIT"),
            "time_stop_count": sum(1 for trade in run.trades if trade.fill_exit_date and trade.fill_exit_date.year == year and trade.close_reason and trade.close_reason.value == "TIME_STOP"),
        }
    return summary

