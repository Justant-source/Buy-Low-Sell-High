from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from ..backtest.engine import run_backtest
from ..backtest.regime import (
    ATTACK_REGIME_LABEL,
    DEFAULT_REGIME_LABEL,
    DEFENSE_REGIME_LABEL,
    _evaluate_regime,
    build_regime_context,
)
from ..code_version import current_code_commit
from ..data.quality import compute_data_hash
from ..domain.enums import ExecutionModel, PriceBasis, SizingMode
from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D, ZERO
from .research_common import (
    PARAMETER_SWEEP_DEFINITION,
    REGIME_PARAMETER_SWEEP_DEFINITION,
    as_number,
    mean_decimal,
    stable_hash,
)
from .strategy_explorer import build_slice_strategy_rankings
from .strategy_specs import build_strategy_config, iter_parameter_strategy_specs, iter_regime_strategy_specs

TRAINING_YEARS = 3
TEST_YEARS = 1
DECISION_START_YEAR = 2022
FULL_PERIOD_CAGR_DRAG_LIMIT = D("-0.75")
FULL_PERIOD_RETURN_DRAG_LIMIT = D("-50")
FULL_PERIOD_MDD_IMPROVEMENT_EXCEPTION = D("5")
RECENT_WIN_MINIMUM = 3
RECENT_REQUIRED_FOLDS = 4
MAX_ACCEPTABLE_MDD_WORSENING = D("-3")
MEANINGFUL_MDD_IMPROVEMENT = D("5")
DOC_PATHS = {
    "adr": "docs/90-adr/0007-soxl-three-state-regime.md",
    "strategy": "docs/70-policy/strategy.md",
    "ssot": "docs/70-policy/ddeolsao-pal-ssot.md",
}


@dataclass(frozen=True)
class WalkForwardWindow:
    train_start_year: int
    train_end_year: int
    test_year: int


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _daily_bar(session_date: date, close: str, *, symbol: str = "SOXL") -> MarketBar:
    price = D(close)
    return MarketBar(
        symbol=symbol,
        session_date=session_date,
        open=price,
        high=price + D("1"),
        low=price - D("1"),
        close=price,
        adj_close=price,
        source="audit",
    )


def _weekly_bar(start_friday: date, week_offset: int, close: str, *, symbol: str = "QQQ") -> MarketBar:
    return _daily_bar(start_friday + timedelta(weeks=week_offset), close, symbol=symbol)


def _serialize_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    return {key: str(value) for key, value in metrics.items()}


def _official_research_config(base_config: StrategyConfig, *, regime_enabled: bool) -> StrategyConfig:
    return replace(
        base_config,
        symbol="SOXL",
        execution_model=ExecutionModel.IDEAL_SAME_CLOSE,
        price_basis=PriceBasis.ADJUSTED_CLOSE,
        sizing_mode=SizingMode.FIXED_PRINCIPAL,
        regime_enabled=regime_enabled,
    )


def _bars_for_years(bars: list[MarketBar], start_year: int, end_year: int) -> list[MarketBar]:
    return [bar for bar in bars if start_year <= bar.session_date.year <= end_year]


def _complete_calendar_years(bars: list[MarketBar]) -> list[int]:
    years = sorted({bar.session_date.year for bar in bars})
    if not years:
        return []
    last_session = bars[-1].session_date
    if last_session < date(last_session.year, 12, 31):
        years = [year for year in years if year != last_session.year]
    return years


def _walk_forward_windows(years: list[int], *, training_years: int = TRAINING_YEARS) -> list[WalkForwardWindow]:
    windows: list[WalkForwardWindow] = []
    for index in range(len(years) - training_years):
        training_slice = years[index:index + training_years]
        test_year = years[index + training_years]
        if training_slice[-1] - training_slice[0] != training_years - 1:
            continue
        if test_year != training_slice[-1] + 1:
            continue
        windows.append(
            WalkForwardWindow(
                train_start_year=training_slice[0],
                train_end_year=training_slice[-1],
                test_year=test_year,
            )
        )
    return windows


def _decimal_delta(left: object, right: object) -> Decimal:
    return D(str(right)) - D(str(left))


def _fold_verdict(*, delta_cagr: Decimal, delta_return: Decimal, delta_mdd: Decimal) -> str:
    if (delta_cagr > ZERO or delta_return > ZERO) and delta_mdd >= MAX_ACCEPTABLE_MDD_WORSENING:
        return "WIN"
    if delta_cagr <= ZERO and delta_return <= ZERO and delta_mdd >= MEANINGFUL_MDD_IMPROVEMENT:
        return "RISK_WIN"
    return "LOSS"


def _doc_text(path: str) -> str:
    return (_repo_root() / path).read_text(encoding="utf-8")


def _neutral_doc_semantics(text_by_path: dict[str, str]) -> dict[str, list[str]]:
    explicit_neutral: list[str] = []
    carry_forward: list[str] = []
    for path, text in text_by_path.items():
        if "그 사이 → `neutral`" in text or "그 사이는 `neutral`" in text or "neutral`: `45 < RSI < 55`" in text:
            explicit_neutral.append(path)
        if "neutral 주간은 직전 regime을 유지" in text:
            carry_forward.append(path)
    return {
        "explicit_neutral": explicit_neutral,
        "carry_forward": carry_forward,
    }


def _audit_threshold_mapping(config: StrategyConfig) -> dict[str, Any]:
    return {
        "item_id": "threshold_state_machine",
        "status": "PASS"
        if _evaluate_regime(config, completed_week_rsi=D("55")) == ATTACK_REGIME_LABEL
        and _evaluate_regime(config, completed_week_rsi=D("45")) == DEFENSE_REGIME_LABEL
        and _evaluate_regime(config, completed_week_rsi=D("50")) == DEFAULT_REGIME_LABEL
        else "FAIL",
        "detail": "RSI 55/45 threshold mapping should resolve to attack/defense and mid-band should resolve to neutral.",
        "observed_runtime_behavior": {
            "rsi_55": _evaluate_regime(config, completed_week_rsi=D("55")),
            "rsi_45": _evaluate_regime(config, completed_week_rsi=D("45")),
            "rsi_50": _evaluate_regime(config, completed_week_rsi=D("50")),
        },
        "evidence": [
            "engine/src/buy_low_sell_high/backtest/regime.py",
            DOC_PATHS["adr"],
            DOC_PATHS["strategy"],
        ],
    }


def _audit_completed_week_only(config: StrategyConfig) -> dict[str, Any]:
    start_friday = date(2024, 1, 5)
    regime_bars = [_weekly_bar(start_friday, index, str(100 - index)) for index in range(15)]
    regime_bars.append(_daily_bar(start_friday + timedelta(weeks=15, days=3), "200", symbol="QQQ"))
    primary_week_start = start_friday + timedelta(weeks=15, days=3)
    primary_bars = [
        _daily_bar(primary_week_start, "10"),
        _daily_bar(primary_week_start + timedelta(days=1), "9"),
    ]
    context = build_regime_context(
        primary_bars,
        config,
        regime_bars=regime_bars,
        regime_data_hash="audit-fixture",
    )
    observed = context.parameters_for_session(primary_bars[0].session_date).regime
    return {
        "item_id": "completed_week_only",
        "status": "PASS" if observed == DEFENSE_REGIME_LABEL else "FAIL",
        "detail": "The current in-progress week should not override the previous completed week's regime.",
        "observed_runtime_behavior": {
            "applied_regime": observed,
        },
        "evidence": [
            "engine/src/buy_low_sell_high/backtest/regime.py",
            DOC_PATHS["adr"],
            DOC_PATHS["strategy"],
            DOC_PATHS["ssot"],
        ],
    }


def _audit_warmup_neutral(config: StrategyConfig) -> dict[str, Any]:
    start_friday = date(2024, 1, 5)
    regime_bars = [_weekly_bar(start_friday, index, str(100 + index)) for index in range(10)]
    primary_week_start = start_friday + timedelta(weeks=10, days=3)
    primary_bars = [_daily_bar(primary_week_start, "10")]
    context = build_regime_context(
        primary_bars,
        config,
        regime_bars=regime_bars,
        regime_data_hash="audit-fixture",
    )
    observed = context.parameters_for_session(primary_bars[0].session_date).regime
    return {
        "item_id": "warmup_neutral",
        "status": "PASS" if observed == DEFAULT_REGIME_LABEL else "FAIL",
        "detail": "Pre-RSI warmup sessions should use neutral parameters.",
        "observed_runtime_behavior": {
            "applied_regime": observed,
        },
        "evidence": [
            "engine/src/buy_low_sell_high/backtest/regime.py",
            DOC_PATHS["adr"],
            DOC_PATHS["strategy"],
            DOC_PATHS["ssot"],
        ],
    }


def _audit_entry_parameter_capture(config: StrategyConfig) -> dict[str, Any]:
    start_friday = date(2024, 1, 5)
    regime_bars = [_weekly_bar(start_friday, index, str(100 - index)) for index in range(15)]
    regime_bars.append(_weekly_bar(start_friday, 15, "84"))
    primary_week_start = regime_bars[-1].session_date + timedelta(days=3)
    primary_bars = [
        _daily_bar(primary_week_start, "10"),
        _daily_bar(primary_week_start + timedelta(days=1), "9"),
        _daily_bar(primary_week_start + timedelta(days=2), "8"),
    ]
    audit_config = replace(
        config,
        thread_count=1,
        commission_bps=ZERO,
        transaction_tax_bps=ZERO,
        slippage_bps=ZERO,
        regime_base_stop_sessions=5,
        regime_base_buy_pct=ZERO,
        regime_base_sell_pct=D("99"),
        regime_bull_stop_sessions=3,
        regime_bull_buy_pct=ZERO,
        regime_bull_sell_pct=D("99"),
        regime_bear_stop_sessions=1,
        regime_bear_buy_pct=ZERO,
        regime_bear_sell_pct=D("99"),
    )
    run = run_backtest(
        primary_bars,
        audit_config,
        data_hash="audit-fixture",
        regime_context=build_regime_context(
            primary_bars,
            audit_config,
            regime_bars=regime_bars,
            regime_data_hash="audit-fixture",
        ),
    )
    trade = run.trades[0]
    passed = (
        trade.entry_regime == DEFENSE_REGIME_LABEL
        and trade.entry_stop_sessions == 1
        and str(trade.entry_buy_pct) == "0"
        and str(trade.entry_sell_pct) == "99"
    )
    return {
        "item_id": "entry_parameter_capture",
        "status": "PASS" if passed else "FAIL",
        "detail": "Entries opened under a regime should record that regime's parameters on the trade.",
        "observed_runtime_behavior": {
            "entry_regime": trade.entry_regime,
            "entry_stop_sessions": trade.entry_stop_sessions,
            "entry_buy_pct": str(trade.entry_buy_pct),
            "entry_sell_pct": str(trade.entry_sell_pct),
        },
        "evidence": [
            "engine/src/buy_low_sell_high/strategies/ddeolsao_pal.py",
            "engine/src/buy_low_sell_high/backtest/regime.py",
            DOC_PATHS["ssot"],
        ],
    }


def _audit_neutral_doc_consistency(config: StrategyConfig) -> dict[str, Any]:
    texts = {path: _doc_text(path) for path in DOC_PATHS.values()}
    positions = _neutral_doc_semantics(texts)
    observed = _evaluate_regime(config, completed_week_rsi=D("50"))
    if positions["explicit_neutral"] and positions["carry_forward"]:
        status = "AMBIGUOUS"
        detail = "Documentation disagrees on whether mid-band weeks should reset to neutral or carry the previous attack/defense state."
    elif positions["explicit_neutral"] and observed == DEFAULT_REGIME_LABEL:
        status = "PASS"
        detail = "Documentation and implementation both treat mid-band weeks as neutral."
    else:
        status = "FAIL"
        detail = "Implementation mid-band behavior does not align with the documented neutral-state expectation."
    return {
        "item_id": "neutral_transition_semantics",
        "status": status,
        "detail": detail,
        "observed_runtime_behavior": {
            "rsi_50_regime": observed,
        },
        "supporting_sources": positions["explicit_neutral"],
        "conflicting_sources": positions["carry_forward"],
        "recommended_source_of_truth": DOC_PATHS["adr"],
    }


def build_regime_audit_report(base_config: StrategyConfig) -> dict[str, Any]:
    config = _official_research_config(base_config, regime_enabled=True)
    items = [
        _audit_threshold_mapping(config),
        _audit_completed_week_only(config),
        _audit_warmup_neutral(config),
        _audit_entry_parameter_capture(config),
        _audit_neutral_doc_consistency(config),
    ]
    status_counts = {
        "PASS": sum(1 for item in items if item["status"] == "PASS"),
        "FAIL": sum(1 for item in items if item["status"] == "FAIL"),
        "AMBIGUOUS": sum(1 for item in items if item["status"] == "AMBIGUOUS"),
    }
    if status_counts["FAIL"] > 0:
        classification = "implementation_bug"
    elif status_counts["AMBIGUOUS"] > 0:
        classification = "documentation_conflict"
    else:
        classification = "no_semantic_issue_found"
    return {
        "classification": classification,
        "blocking": classification != "no_semantic_issue_found",
        "status_counts": status_counts,
        "items": items,
    }


def _class_combo_count(base_config: StrategyConfig, *, regime_enabled: bool) -> int:
    if regime_enabled:
        return len(iter_regime_strategy_specs(_official_research_config(base_config, regime_enabled=True)))
    return len(iter_parameter_strategy_specs(PARAMETER_SWEEP_DEFINITION))


def _winner_summary(
    bars: list[MarketBar],
    config: StrategyConfig,
    *,
    data_hash: str,
    max_workers: int,
) -> tuple[dict[str, Any], StrategyConfig]:
    ranking = build_slice_strategy_rankings(
        bars,
        config,
        data_hash=data_hash,
        execution_model=ExecutionModel.IDEAL_SAME_CLOSE.value,
        price_basis=PriceBasis.ADJUSTED_CLOSE.value,
        limit=1,
        max_workers=max_workers,
    )
    row = ranking["rows"][0]
    winner_config = build_strategy_config(
        config,
        row,
        execution_model=ExecutionModel.IDEAL_SAME_CLOSE.value,
        price_basis=PriceBasis.ADJUSTED_CLOSE.value,
    )
    return row, winner_config


def _candidate_run_summary(bars: list[MarketBar], config: StrategyConfig, *, data_hash: str) -> dict[str, Any]:
    run = run_backtest(bars, config, data_hash=data_hash)
    return {
        "strategy_id": config.profile_id,
        "config_hash": config.config_hash(),
        "regime_config_hash": run.regime_config_hash,
        "regime_data_hash": run.regime_data_hash,
        "metrics": _serialize_metrics(run.metrics),
    }


def _fold_payload(
    window: WalkForwardWindow,
    off_train_row: dict[str, Any],
    off_train_config: StrategyConfig,
    on_train_row: dict[str, Any],
    on_train_config: StrategyConfig,
    train_bars: list[MarketBar],
    test_bars: list[MarketBar],
) -> dict[str, Any]:
    train_hash = compute_data_hash(train_bars)
    test_hash = compute_data_hash(test_bars)
    off_train = _candidate_run_summary(train_bars, off_train_config, data_hash=train_hash)
    on_train = _candidate_run_summary(train_bars, on_train_config, data_hash=train_hash)
    off_test = _candidate_run_summary(test_bars, off_train_config, data_hash=test_hash)
    on_test = _candidate_run_summary(test_bars, on_train_config, data_hash=test_hash)
    delta_cagr = _decimal_delta(off_test["metrics"]["cagr_pct"], on_test["metrics"]["cagr_pct"])
    delta_return = _decimal_delta(off_test["metrics"]["total_return_pct"], on_test["metrics"]["total_return_pct"])
    delta_mdd = _decimal_delta(off_test["metrics"]["max_drawdown_pct"], on_test["metrics"]["max_drawdown_pct"])
    return {
        "train_start": train_bars[0].session_date.isoformat(),
        "train_end": train_bars[-1].session_date.isoformat(),
        "train_data_hash": train_hash,
        "test_year": window.test_year,
        "test_start": test_bars[0].session_date.isoformat(),
        "test_end": test_bars[-1].session_date.isoformat(),
        "test_data_hash": test_hash,
        "decision_focus_oos": window.test_year >= DECISION_START_YEAR,
        "off_winner": {
            "strategy_id": off_train_row["strategy_id"],
            "display_params": off_train_row["display_params"],
            "train_metrics": off_train["metrics"],
            "test_metrics": off_test["metrics"],
            "config_hash": off_test["config_hash"],
        },
        "on_winner": {
            "strategy_id": on_train_row["strategy_id"],
            "display_params": on_train_row["display_params"],
            "train_metrics": on_train["metrics"],
            "test_metrics": on_test["metrics"],
            "config_hash": on_test["config_hash"],
            "regime_config_hash": on_test["regime_config_hash"],
            "regime_data_hash": on_test["regime_data_hash"],
        },
        "delta_oos": {
            "cagr_pct": as_number(delta_cagr),
            "total_return_pct": as_number(delta_return),
            "max_drawdown_pct": as_number(delta_mdd),
        },
        "verdict": _fold_verdict(
            delta_cagr=delta_cagr,
            delta_return=delta_return,
            delta_mdd=delta_mdd,
        ),
    }


def _full_period_summary(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    max_workers: int,
) -> dict[str, Any]:
    data_hash = compute_data_hash(bars)
    off_config = _official_research_config(base_config, regime_enabled=False)
    on_config = _official_research_config(base_config, regime_enabled=True)
    off_row, off_winner_config = _winner_summary(bars, off_config, data_hash=data_hash, max_workers=max_workers)
    on_row, on_winner_config = _winner_summary(bars, on_config, data_hash=data_hash, max_workers=max_workers)
    baseline_run = run_backtest(bars, off_config, data_hash=data_hash)
    return {
        "off_best": {
            "strategy_id": off_row["strategy_id"],
            "display_params": off_row["display_params"],
            "metrics": _serialize_metrics(run_backtest(bars, off_winner_config, data_hash=data_hash).metrics),
            "config_hash": off_winner_config.config_hash(),
        },
        "on_best": {
            "strategy_id": on_row["strategy_id"],
            "display_params": on_row["display_params"],
            "metrics": _serialize_metrics(run_backtest(bars, on_winner_config, data_hash=data_hash).metrics),
            "config_hash": on_winner_config.config_hash(),
            "regime_config_hash": on_winner_config.regime_config_hash(),
        },
        "canonical_off_baseline": {
            "strategy_id": off_config.profile_id,
            "display_params": f"T{off_config.thread_count} / {off_config.stop_sessions}S / BUY {off_config.entry_drop_pct:+.0f}% / SELL {off_config.take_profit_pct:+.0f}%",
            "metrics": _serialize_metrics(baseline_run.metrics),
            "config_hash": off_config.config_hash(),
        },
    }


def _decision_payload(audit: dict[str, Any], folds: list[dict[str, Any]], full_period: dict[str, Any]) -> dict[str, Any]:
    recent_folds = [fold for fold in folds if fold["decision_focus_oos"]]
    recent_win_count = sum(1 for fold in recent_folds if fold["verdict"] == "WIN")
    recent_risk_win_count = sum(1 for fold in recent_folds if fold["verdict"] == "RISK_WIN")
    delta_cagrs = [D(str(fold["delta_oos"]["cagr_pct"])) for fold in recent_folds]
    delta_returns = [D(str(fold["delta_oos"]["total_return_pct"])) for fold in recent_folds]
    delta_mdds = [D(str(fold["delta_oos"]["max_drawdown_pct"])) for fold in recent_folds]
    avg_delta_cagr = mean_decimal(delta_cagrs)
    avg_delta_return = mean_decimal(delta_returns)
    avg_delta_mdd = mean_decimal(delta_mdds)

    full_off = full_period["off_best"]["metrics"]
    full_on = full_period["on_best"]["metrics"]
    full_cagr_drag = _decimal_delta(full_off["cagr_pct"], full_on["cagr_pct"])
    full_return_drag = _decimal_delta(full_off["total_return_pct"], full_on["total_return_pct"])
    full_mdd_improvement = _decimal_delta(full_off["max_drawdown_pct"], full_on["max_drawdown_pct"])

    sufficient_recent_folds = len(recent_folds) >= RECENT_REQUIRED_FOLDS
    recent_profit_gate = avg_delta_cagr > ZERO or avg_delta_return > ZERO
    long_term_gate = (
        (full_cagr_drag >= FULL_PERIOD_CAGR_DRAG_LIMIT and full_return_drag >= FULL_PERIOD_RETURN_DRAG_LIMIT)
        or full_mdd_improvement >= FULL_PERIOD_MDD_IMPROVEMENT_EXCEPTION
    )
    strict_gate = (
        not audit["blocking"]
        and sufficient_recent_folds
        and recent_win_count >= RECENT_WIN_MINIMUM
        and recent_profit_gate
        and long_term_gate
    )
    time_boxed_gate = (
        not strict_gate
        and not audit["blocking"]
        and (
            recent_win_count >= 2
            or recent_risk_win_count >= 2
            or avg_delta_cagr > ZERO
            or avg_delta_return > ZERO
            or avg_delta_mdd >= MEANINGFUL_MDD_IMPROVEMENT
        )
    )
    if audit["blocking"]:
        recommendation = "defer_verdict_until_semantic_fix"
    elif strict_gate:
        recommendation = "continue_as_secondary_hypothesis"
    elif time_boxed_gate:
        recommendation = "time_boxed_follow_up_only"
    else:
        recommendation = "stop_regime_research"
    return {
        "recommendation": recommendation,
        "gate_results": {
            "audit_blocking": audit["blocking"],
            "sufficient_recent_folds": sufficient_recent_folds,
            "recent_win_count": recent_win_count,
            "recent_risk_win_count": recent_risk_win_count,
            "avg_delta_cagr_pct": as_number(avg_delta_cagr),
            "avg_delta_total_return_pct": as_number(avg_delta_return),
            "avg_delta_mdd_pct": as_number(avg_delta_mdd),
            "full_period_cagr_drag_pct": as_number(full_cagr_drag),
            "full_period_total_return_drag_pct": as_number(full_return_drag),
            "full_period_mdd_improvement_pct": as_number(full_mdd_improvement),
            "recent_profit_gate": recent_profit_gate,
            "long_term_gate": long_term_gate,
            "strict_gate": strict_gate,
        },
        "notes": [
            "Recent out-of-sample gate uses completed test years starting in 2022.",
            "A blocking audit result means the performance verdict should not be treated as final.",
        ],
    }


def build_regime_walk_forward_report(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    data_hash: str = "adhoc",
    max_workers: int = 1,
) -> dict[str, Any]:
    if not bars:
        raise ValueError("No bars provided")
    if str(base_config.symbol).upper() != "SOXL":
        raise ValueError("Regime walk-forward research only supports SOXL")

    off_config = _official_research_config(base_config, regime_enabled=False)
    on_config = _official_research_config(base_config, regime_enabled=True)
    audit = build_regime_audit_report(base_config)
    complete_years = _complete_calendar_years(bars)
    windows = _walk_forward_windows(complete_years)

    folds: list[dict[str, Any]] = []
    for window in windows:
        train_bars = _bars_for_years(bars, window.train_start_year, window.train_end_year)
        test_bars = _bars_for_years(bars, window.test_year, window.test_year)
        if not train_bars or not test_bars:
            continue
        train_hash = compute_data_hash(train_bars)
        off_train_row, off_train_config = _winner_summary(
            train_bars,
            off_config,
            data_hash=train_hash,
            max_workers=max_workers,
        )
        on_train_row, on_train_config = _winner_summary(
            train_bars,
            on_config,
            data_hash=train_hash,
            max_workers=max_workers,
        )
        folds.append(
            _fold_payload(
                window,
                off_train_row,
                off_train_config,
                on_train_row,
                on_train_config,
                train_bars,
                test_bars,
            )
        )

    full_period = _full_period_summary(bars, base_config, max_workers=max_workers)
    decision = _decision_payload(audit, folds, full_period)
    payload = {
        "meta": {
            "symbol": "SOXL",
            "profile_id": base_config.profile_id,
            "period_start": bars[0].session_date.isoformat(),
            "period_end": bars[-1].session_date.isoformat(),
            "data_hash": data_hash,
            "code_commit": current_code_commit(),
            "execution_model": ExecutionModel.IDEAL_SAME_CLOSE.value,
            "price_basis": PriceBasis.ADJUSTED_CLOSE.value,
            "sizing_mode": SizingMode.FIXED_PRINCIPAL.value,
            "window_scheme": {
                "training_years": TRAINING_YEARS,
                "test_years": TEST_YEARS,
                "decision_start_year": DECISION_START_YEAR,
            },
            "complete_calendar_years": complete_years,
            "off_combo_count": _class_combo_count(base_config, regime_enabled=False),
            "on_combo_count": _class_combo_count(base_config, regime_enabled=True),
            "regime_config_hash": on_config.regime_config_hash(),
            "regime_grid_hash": stable_hash(REGIME_PARAMETER_SWEEP_DEFINITION),
        },
        "audit": audit,
        "walk_forward": {
            "folds": folds,
        },
        "full_period": full_period,
        "decision": decision,
    }
    payload["payload_hash"] = stable_hash(payload)
    return payload
