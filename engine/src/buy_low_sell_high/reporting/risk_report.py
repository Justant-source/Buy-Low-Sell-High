from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from ..backtest.engine import run_backtest
from ..backtest.sweep import run_grid
from ..domain.enums import ExecutionModel
from ..domain.models import BacktestRun, MarketBar, StrategyConfig
from ..domain.money import D, ZERO, quantize_money


def _recovery_metrics(run: BacktestRun) -> dict[str, int | bool | None]:
    if not run.daily:
        return {
            "peak_to_trough_sessions": None,
            "trough_to_recovery_sessions": None,
            "peak_to_recovery_sessions": None,
            "recovered": False,
        }
    peak_equity = run.daily[0].total_equity
    peak_index = 0
    worst_drawdown = ZERO
    trough_index: int | None = None
    peak_before_trough: Decimal | None = None
    peak_before_trough_index: int | None = None

    for index, snapshot in enumerate(run.daily):
        if snapshot.total_equity > peak_equity:
            peak_equity = snapshot.total_equity
            peak_index = index
        if snapshot.drawdown < worst_drawdown:
            worst_drawdown = snapshot.drawdown
            trough_index = index
            peak_before_trough = peak_equity
            peak_before_trough_index = peak_index

    if trough_index is None or peak_before_trough is None or peak_before_trough_index is None:
        return {
            "peak_to_trough_sessions": 0,
            "trough_to_recovery_sessions": 0,
            "peak_to_recovery_sessions": 0,
            "recovered": True,
        }

    recovery_index: int | None = None
    for index in range(trough_index, len(run.daily)):
        if run.daily[index].total_equity >= peak_before_trough:
            recovery_index = index
            break

    if recovery_index is None:
        return {
            "peak_to_trough_sessions": trough_index - peak_before_trough_index,
            "trough_to_recovery_sessions": None,
            "peak_to_recovery_sessions": None,
            "recovered": False,
        }

    return {
        "peak_to_trough_sessions": trough_index - peak_before_trough_index,
        "trough_to_recovery_sessions": recovery_index - trough_index,
        "peak_to_recovery_sessions": recovery_index - peak_before_trough_index,
        "recovered": True,
    }


def _scenario_row(run: BacktestRun, label: str, *, commission_bps: Decimal = ZERO, slippage_bps: Decimal = ZERO) -> dict[str, object]:
    recovery = _recovery_metrics(run)
    return {
      "label": label,
      "execution_model": run.config.execution_model.value,
      "commission_bps": str(commission_bps),
      "slippage_bps": str(slippage_bps),
      "total_return_pct": str(run.metrics["total_return_pct"]),
      "max_drawdown_pct": str(run.metrics["max_drawdown_pct"]),
      "volatility_pct": str(run.metrics["volatility_pct"]),
      "trade_count": run.metrics["trade_count"],
      "peak_to_trough_sessions": recovery["peak_to_trough_sessions"],
      "trough_to_recovery_sessions": recovery["trough_to_recovery_sessions"],
      "peak_to_recovery_sessions": recovery["peak_to_recovery_sessions"],
      "recovered": recovery["recovered"],
    }


def _clone_config(config: StrategyConfig, **overrides: object) -> StrategyConfig:
    return replace(config, **overrides)


def _metric_delta(left: str, right: str) -> str:
    return str(quantize_money(D(right) - D(left)))


def build_risk_report(bars: list[MarketBar], config: StrategyConfig, *, data_hash: str = "adhoc") -> dict[str, object]:
    base = _clone_config(config, commission_bps=ZERO, slippage_bps=ZERO)
    ideal_run = run_backtest(bars, _clone_config(base, execution_model=ExecutionModel.IDEAL_SAME_CLOSE), data_hash=data_hash)
    next_open_run = run_backtest(bars, _clone_config(base, execution_model=ExecutionModel.NEXT_OPEN), data_hash=data_hash)
    next_close_run = run_backtest(bars, _clone_config(base, execution_model=ExecutionModel.NEXT_CLOSE), data_hash=data_hash)

    cost_scenarios = [
        ("No Cost", D("0"), D("0")),
        ("Low Friction", D("5"), D("5")),
        ("Stress Cost", D("15"), D("15")),
    ]
    cost_rows: list[dict[str, object]] = []
    for label, commission_bps, slippage_bps in cost_scenarios:
        run = run_backtest(
            bars,
            _clone_config(
                base,
                execution_model=ExecutionModel.NEXT_OPEN,
                commission_bps=commission_bps,
                slippage_bps=slippage_bps,
            ),
            data_hash=data_hash,
        )
        cost_rows.append(_scenario_row(run, label, commission_bps=commission_bps, slippage_bps=slippage_bps))

    sensitivity_runs = run_grid(
        bars,
        _clone_config(base, execution_model=ExecutionModel.NEXT_OPEN),
        [5, 6, 7],
        [10, 30, 40],
        data_hash=data_hash,
    )
    best_return = max(sensitivity_runs, key=lambda run: D(run.metrics["total_return_pct"]))
    lowest_mdd = max(sensitivity_runs, key=lambda run: D(run.metrics["max_drawdown_pct"]))

    model_rows = [
        _scenario_row(ideal_run, "Research Close"),
        _scenario_row(next_open_run, "Next Open"),
        _scenario_row(next_close_run, "Next Close"),
    ]
    summary = {
        "ideal_to_next_open_return_drag_pct": _metric_delta(
            str(ideal_run.metrics["total_return_pct"]),
            str(next_open_run.metrics["total_return_pct"]),
        ),
        "next_open_to_next_close_return_drag_pct": _metric_delta(
            str(next_open_run.metrics["total_return_pct"]),
            str(next_close_run.metrics["total_return_pct"]),
        ),
        "stress_cost_drag_pct": _metric_delta(
            str(cost_rows[0]["total_return_pct"]),
            str(cost_rows[-1]["total_return_pct"]),
        ),
        "worst_recovery_sessions": max(
            (
                row["peak_to_recovery_sessions"]
                for row in [*model_rows, *cost_rows]
                if isinstance(row["peak_to_recovery_sessions"], int)
            ),
            default=None,
        ),
    }

    leverage_warning = (
        f"{config.symbol} is a leveraged instrument; close-to-open gap risk can materially change realized outcomes."
    )
    if config.symbol == "SOXL":
        leverage_warning = "SOXL is a leveraged ETF; close-to-open gap risk can materially change realized outcomes."

    return {
        "profile_id": config.profile_id,
        "symbol": config.symbol,
        "data_hash": data_hash,
        "config_hash": config.config_hash(),
        "model_comparison": model_rows,
        "cost_sensitivity": cost_rows,
        "sensitivity_summary": {
            "best_next_open_return_cell": {
                "thread_count": best_return.config.thread_count,
                "stop_sessions": best_return.config.stop_sessions,
                "total_return_pct": str(best_return.metrics["total_return_pct"]),
            },
            "lowest_next_open_mdd_cell": {
                "thread_count": lowest_mdd.config.thread_count,
                "stop_sessions": lowest_mdd.config.stop_sessions,
                "max_drawdown_pct": str(lowest_mdd.metrics["max_drawdown_pct"]),
            },
        },
        "summary": summary,
        "warnings": [
            "ideal_same_close is a research-only benchmark and should not be treated as a live fill expectation.",
            leverage_warning,
            "This dashboard is decision support only and is not investment advice.",
        ],
    }
