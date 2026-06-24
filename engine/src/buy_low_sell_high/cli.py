from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path

from .automation.market_refresh import refresh_market
from .backtest.engine import run_backtest
from .backtest.parity import check_data_parity, check_event_parity, check_performance_parity, load_reference_fixture
from .backtest.sweep import run_grid
from .config import load_strategy_config, load_strategy_mapping
from .data.normalize import normalize_bars
from .data.providers.csv_provider import CsvMarketDataProvider
from .data.quality import compute_data_hash, summarize_import
from .data.sync import snapshot_manifest_path, sync_history
from .domain.models import BacktestJob, StrategyConfig, new_run_id
from .persistence.repositories import InMemoryJobRepository
from .persistence.worker import run_once
from .reporting.mentor_matrix import build_mentor_matrix, load_reference_fixture as load_mentor_matrix_reference
from .reporting.official_explorer import build_official_explorer
from .reporting.official_matrix import build_official_matrix
from .reporting.parameter_sweep import build_parameter_sweep, describe_parameter_sweep_execution
from .reporting.regime_walk_forward import build_regime_walk_forward_report
from .reporting.risk_report import build_risk_report
from .reporting.strategy_ranking_daemon import run_strategy_ranking_pool_daemon
from .reporting.strategy_explorer import build_slice_strategy_rankings, build_strategy_detail, build_strategy_explorer, filter_bars_to_slice
from .reporting.thread_timeline import build_thread_timeline
from .backtest.parity import ParityResult
from .symbols import default_market_data_csv as default_market_data_csv_for_symbol, get_symbol_definition


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_market_data_csv(symbol: str = "SOXL") -> str:
    return default_market_data_csv_for_symbol(symbol)


def bootstrap_check() -> int:
    required_paths = [
        "AGENTS.md",
        "docs/_index.md",
        "docs/70-policy/strategy.md",
        "docker-compose.yml",
        "scripts/verify_no_autotrading.py",
        "dashboard/src/server.ts",
    ]
    root = _repo_root()
    missing = [path for path in required_paths if not (root / path).exists()]
    if missing:
        for path in missing:
            print(f"MISSING: {path}")
        return 1
    print("Bootstrap check passed")
    return 0


def _load_bars(csv_path: str, symbol: str) -> tuple[list[object], str]:
    bars = normalize_bars(CsvMarketDataProvider(csv_path).load_bars(symbol))
    return bars, compute_data_hash(bars)


def _print_json(payload: object) -> int:
    print(json.dumps(payload, indent=2, sort_keys=True, default=str))
    return 0


def _parity_exit_code(*results: ParityResult) -> int:
    return 0 if all(result.status == "PASS" for result in results) else 1


def _add_csv_argument(parser: argparse.ArgumentParser, *, required: bool = False) -> None:
    parser.add_argument("--csv", required=required)


def _resolve_csv_path(csv_path: str | None, symbol: str) -> str:
    return csv_path or default_market_data_csv(symbol)


def _add_strategy_override_arguments(
    parser: argparse.ArgumentParser,
    *,
    include_thread_count: bool = True,
    include_stop_sessions: bool = True,
    include_price_basis: bool = True,
) -> None:
    if include_thread_count:
        parser.add_argument("--thread-count", type=int)
    if include_stop_sessions:
        parser.add_argument("--stop-sessions", type=int)
    parser.add_argument("--take-profit-pct")
    parser.add_argument("--take-profit-operator", choices=["gt", "gte"])
    parser.add_argument("--entry-drop-pct")
    parser.add_argument("--stop-loss-pct")
    parser.add_argument("--max-entries-per-session", type=int)
    parser.add_argument("--sizing-mode")
    if include_price_basis:
        parser.add_argument("--price-basis")
    parser.add_argument("--regime-enabled", action="store_true")
    parser.add_argument("--regime-symbol")
    parser.add_argument("--regime-rsi-period-weeks", type=int)
    parser.add_argument("--regime-bear-high-threshold")
    parser.add_argument("--regime-bear-mid-low-threshold")
    parser.add_argument("--regime-bear-mid-high-threshold")
    parser.add_argument("--regime-bull-low-threshold")
    parser.add_argument("--regime-bull-mid-low-threshold")
    parser.add_argument("--regime-bull-mid-high-threshold")
    parser.add_argument("--regime-base-stop-sessions", type=int)
    parser.add_argument("--regime-base-buy-pct")
    parser.add_argument("--regime-base-sell-pct")
    parser.add_argument("--regime-bull-stop-sessions", type=int)
    parser.add_argument("--regime-bull-buy-pct")
    parser.add_argument("--regime-bull-sell-pct")
    parser.add_argument("--regime-bear-stop-sessions", type=int)
    parser.add_argument("--regime-bear-buy-pct")
    parser.add_argument("--regime-bear-sell-pct")
    parser.add_argument("--regime-csv-path")


def _strategy_overrides_from_args(args: argparse.Namespace) -> dict[str, object]:
    mapping = {
        "thread_count": getattr(args, "thread_count", None),
        "stop_sessions": getattr(args, "stop_sessions", None),
        "take_profit_pct": getattr(args, "take_profit_pct", None),
        "take_profit_operator": getattr(args, "take_profit_operator", None),
        "entry_drop_pct": getattr(args, "entry_drop_pct", None),
        "stop_loss_pct": getattr(args, "stop_loss_pct", None),
        "max_entries_per_session": getattr(args, "max_entries_per_session", None),
        "sizing_mode": getattr(args, "sizing_mode", None),
        "price_basis": getattr(args, "price_basis", None),
        "regime_enabled": True if getattr(args, "regime_enabled", False) else None,
        "regime_symbol": getattr(args, "regime_symbol", None),
        "regime_rsi_period_weeks": getattr(args, "regime_rsi_period_weeks", None),
        "regime_bear_high_threshold": getattr(args, "regime_bear_high_threshold", None),
        "regime_bear_mid_low_threshold": getattr(args, "regime_bear_mid_low_threshold", None),
        "regime_bear_mid_high_threshold": getattr(args, "regime_bear_mid_high_threshold", None),
        "regime_bull_low_threshold": getattr(args, "regime_bull_low_threshold", None),
        "regime_bull_mid_low_threshold": getattr(args, "regime_bull_mid_low_threshold", None),
        "regime_bull_mid_high_threshold": getattr(args, "regime_bull_mid_high_threshold", None),
        "regime_base_stop_sessions": getattr(args, "regime_base_stop_sessions", None),
        "regime_base_buy_pct": getattr(args, "regime_base_buy_pct", None),
        "regime_base_sell_pct": getattr(args, "regime_base_sell_pct", None),
        "regime_bull_stop_sessions": getattr(args, "regime_bull_stop_sessions", None),
        "regime_bull_buy_pct": getattr(args, "regime_bull_buy_pct", None),
        "regime_bull_sell_pct": getattr(args, "regime_bull_sell_pct", None),
        "regime_bear_stop_sessions": getattr(args, "regime_bear_stop_sessions", None),
        "regime_bear_buy_pct": getattr(args, "regime_bear_buy_pct", None),
        "regime_bear_sell_pct": getattr(args, "regime_bear_sell_pct", None),
        "regime_csv_path": getattr(args, "regime_csv_path", None),
    }
    return {key: value for key, value in mapping.items() if value is not None}


def _load_strategy_config_with_overrides(args: argparse.Namespace) -> StrategyConfig:
    payload = load_strategy_mapping(args.profile, initial_capital=args.initial_capital)
    payload.update(_strategy_overrides_from_args(args))
    return StrategyConfig.from_mapping(payload)


def _serialize_config(config: StrategyConfig) -> dict[str, object]:
    return {
        "profile_id": config.profile_id,
        "symbol": config.symbol,
        "thread_count": config.thread_count,
        "stop_sessions": config.stop_sessions,
        "max_entries_per_session": config.max_entries_per_session,
        "take_profit_pct": str(config.take_profit_pct),
        "take_profit_operator": config.take_profit_operator,
        "entry_drop_pct": str(config.entry_drop_pct),
        "stop_loss_pct": str(config.stop_loss_pct),
        "price_basis": config.price_basis.value,
        "execution_model": config.execution_model.value,
        "sizing_mode": config.sizing_mode.value,
        "year_boundary": config.year_boundary.value,
        "end_of_test": config.end_of_test.value,
        "commission_bps": str(config.commission_bps),
        "transaction_tax_bps": str(config.transaction_tax_bps),
        "slippage_bps": str(config.slippage_bps),
        "regime_enabled": config.regime_enabled,
        "regime_symbol": config.regime_symbol,
        "regime_rsi_period_weeks": config.regime_rsi_period_weeks,
        "regime_bear_high_threshold": str(config.regime_bear_high_threshold),
        "regime_bear_mid_low_threshold": str(config.regime_bear_mid_low_threshold),
        "regime_bear_mid_high_threshold": str(config.regime_bear_mid_high_threshold),
        "regime_bull_low_threshold": str(config.regime_bull_low_threshold),
        "regime_bull_mid_low_threshold": str(config.regime_bull_mid_low_threshold),
        "regime_bull_mid_high_threshold": str(config.regime_bull_mid_high_threshold),
        "regime_base_stop_sessions": config.regime_base_stop_sessions,
        "regime_base_buy_pct": str(config.regime_base_buy_pct),
        "regime_base_sell_pct": str(config.regime_base_sell_pct),
        "regime_bull_stop_sessions": config.regime_bull_stop_sessions,
        "regime_bull_buy_pct": str(config.regime_bull_buy_pct),
        "regime_bull_sell_pct": str(config.regime_bull_sell_pct),
        "regime_bear_stop_sessions": config.regime_bear_stop_sessions,
        "regime_bear_buy_pct": str(config.regime_bear_buy_pct),
        "regime_bear_sell_pct": str(config.regime_bear_sell_pct),
        "regime_config_hash": config.regime_config_hash(),
        "regime_csv_path": config.regime_csv_path,
        "config_hash": config.config_hash(),
        "initial_capital": str(config.initial_capital),
    }


def _serialize_run(run: object, config: StrategyConfig) -> dict[str, object]:
    return {
        "run_id": run.run_id,
        "profile_id": config.profile_id,
        "code_commit": run.code_commit,
        "data_hash": run.data_hash,
        "config_hash": config.config_hash(),
        "regime_data_hash": run.regime_data_hash,
        "regime_config_hash": run.regime_config_hash,
        "config": _serialize_config(config),
        "metrics": {key: str(value) for key, value in run.metrics.items()},
        "yearly": {
            str(year): {metric: str(value) for metric, value in payload.items()}
            for year, payload in run.yearly.items()
        },
        "daily": [
            {
                "session_date": snapshot.session_date.isoformat(),
                "session_index": snapshot.session_index,
                "total_equity": str(snapshot.total_equity),
                "realized_pnl": str(snapshot.realized_pnl),
                "drawdown": str(snapshot.drawdown),
                "open_threads": snapshot.open_threads,
                "entries": snapshot.entries,
                "take_profits": snapshot.take_profits,
                "time_stops": snapshot.time_stops,
                "skipped_entries": snapshot.skipped_entries,
                "applied_regime": snapshot.applied_regime,
            }
            for snapshot in run.daily
        ],
        "trades": [
            {
                "thread_id": trade.thread_id,
                "signal_date": trade.signal_date.isoformat(),
                "fill_entry_date": trade.fill_entry_date.isoformat(),
                "entry_price": str(trade.entry_price),
                "shares": str(trade.shares),
                "invested_amount": str(trade.invested_amount),
                "entry_fee": str(trade.entry_fee),
                "exit_signal_date": trade.exit_signal_date.isoformat() if trade.exit_signal_date else None,
                "fill_exit_date": trade.fill_exit_date.isoformat() if trade.fill_exit_date else None,
                "exit_price": str(trade.exit_price) if trade.exit_price is not None else None,
                "exit_fee": str(trade.exit_fee),
                "total_fees": str(trade.entry_fee + trade.exit_fee),
                "holding_sessions": trade.holding_sessions,
                "pnl": str(trade.pnl),
                "return_pct": str(trade.return_pct),
                "close_reason": trade.close_reason.value if trade.close_reason else None,
                "entry_regime": trade.entry_regime,
                "entry_stop_sessions": trade.entry_stop_sessions,
                "entry_buy_pct": str(trade.entry_buy_pct),
                "entry_sell_pct": str(trade.entry_sell_pct),
            }
            for trade in run.trades
        ],
    }


def _data_validate(args: argparse.Namespace) -> int:
    csv_path = _resolve_csv_path(args.csv, args.symbol)
    bars, data_hash = _load_bars(csv_path, args.symbol)
    report = summarize_import(args.symbol, "csv", bars)
    return _print_json(
        {
            "symbol": args.symbol,
            "rows": report.rows,
            "data_hash": data_hash,
            "warnings": report.warnings,
        }
    )


def _data_status(args: argparse.Namespace) -> int:
    csv_path = _resolve_csv_path(args.csv, args.symbol)
    bars, data_hash = _load_bars(csv_path, args.symbol)
    report = summarize_import(args.symbol, "csv", bars)
    manifest_path = snapshot_manifest_path(csv_path)
    manifest_payload = None
    if manifest_path.exists():
        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    return _print_json(
        {
            "symbol": args.symbol,
            "rows": len(bars),
            "start": bars[0].session_date.isoformat(),
            "end": bars[-1].session_date.isoformat(),
            "data_hash": data_hash,
            "source": manifest_payload.get("source", bars[-1].source) if manifest_payload else bars[-1].source,
            "warnings": manifest_payload.get("warnings", report.warnings) if manifest_payload else report.warnings,
            "snapshot_path": str(Path(csv_path).resolve()),
            "manifest_path": str(manifest_path.resolve()) if manifest_path.exists() else None,
        }
    )


def _data_sync(args: argparse.Namespace) -> int:
    result = sync_history(
        args.output_csv or default_market_data_csv(args.symbol),
        symbol=args.symbol,
        start_date=args.start_date or get_symbol_definition(args.symbol).dataset_start_date,
    )
    return _print_json(result)


def _automation_refresh_market(args: argparse.Namespace) -> int:
    exit_code, payload = refresh_market(
        args.market,
        skip_materialize=args.skip_materialize,
        force_materialize=args.force_materialize,
        max_sync_workers=args.max_sync_workers,
        max_materialize_workers=args.max_materialize_workers,
        sweep_max_workers=args.sweep_max_workers,
        sweep_chunk_size=args.sweep_chunk_size,
    )
    _print_json(payload)
    return exit_code


def _backtest_run(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    run = run_backtest(bars, config, data_hash=data_hash)
    payload = _serialize_run(run, config)
    payload.pop("daily")
    payload.pop("trades")
    return _print_json(payload)


def _backtest_detail(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    run = run_backtest(bars, config, data_hash=data_hash)
    return _print_json(_serialize_run(run, config))


def _backtest_grid(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    thread_counts = [int(item) for item in args.threads.split(",")]
    stop_sessions = [int(item) for item in args.stops.split(",")]
    runs = run_grid(bars, config, thread_counts, stop_sessions, data_hash=data_hash)
    return _print_json(
        [
            {
                "profile_id": run.config.profile_id,
                "thread_count": run.config.thread_count,
                "stop_sessions": run.config.stop_sessions,
                "config_hash": run.config.config_hash(),
                "data_hash": run.data_hash,
                "total_return_pct": str(run.metrics["total_return_pct"]),
                "max_drawdown_pct": str(run.metrics["max_drawdown_pct"]),
                "volatility_pct": str(run.metrics["volatility_pct"]),
                "trade_count": run.metrics["trade_count"],
            }
            for run in runs
        ]
    )


def _backtest_risk_report(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    return _print_json(build_risk_report(bars, config, data_hash=data_hash))


def _parse_windows(raw: str | None) -> dict[str, tuple[int, int]]:
    if not raw:
        return {
            "total": (2011, 2024),
            "y5": (2020, 2024),
            "y3": (2022, 2024),
            "y1": (2024, 2024),
        }
    windows: dict[str, tuple[int, int]] = {}
    for item in raw.split(","):
        label, span = item.split("=", 1)
        start_year, end_year = span.split(":", 1)
        windows[label] = (int(start_year), int(end_year))
    return windows


def _parse_combo_csv(raw: str) -> tuple[int, ...]:
    return tuple(int(item.strip()) for item in raw.split(",") if item.strip())


def _backtest_strategy_explorer(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    return _print_json(
        build_strategy_explorer(
            bars,
            config,
            data_hash=data_hash,
            catalog_id=args.catalog_id,
            execution_model=args.execution_model,
            price_basis=args.price_basis,
        )
    )


def _backtest_strategy_ranking(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    sliced_bars = filter_bars_to_slice(
        bars,
        slice_start=date.fromisoformat(args.slice_start) if args.slice_start else None,
        slice_end=date.fromisoformat(args.slice_end) if args.slice_end else None,
    )
    return _print_json(
        build_slice_strategy_rankings(
            sliced_bars,
            config,
            data_hash=data_hash,
            execution_model=args.execution_model,
            price_basis=args.price_basis,
            limit=args.limit,
            max_workers=args.max_workers,
        )
    )


def _backtest_strategy_detail(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    sliced_bars = filter_bars_to_slice(
        bars,
        slice_start=date.fromisoformat(args.slice_start) if args.slice_start else None,
        slice_end=date.fromisoformat(args.slice_end) if args.slice_end else None,
    )
    return _print_json(
        build_strategy_detail(
            sliced_bars,
            config,
            strategy_id=args.strategy_id,
            data_hash=data_hash,
            execution_model=args.execution_model,
            price_basis=args.price_basis,
        )
    )


def _backtest_parameter_sweep(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    if getattr(args, "dry_run", False):
        return _print_json(
            describe_parameter_sweep_execution(
                bars,
                config,
                data_hash=data_hash,
                sweep_id=args.sweep_id,
                execution_model=args.execution_model,
                price_basis=args.price_basis,
                max_workers=args.max_workers,
                chunk_size=args.chunk_size,
            )
        )
    return _print_json(
        build_parameter_sweep(
            bars,
            config,
            data_hash=data_hash,
            sweep_id=args.sweep_id,
            execution_model=args.execution_model,
            price_basis=args.price_basis,
            max_workers=args.max_workers,
            chunk_size=args.chunk_size,
        )
    )


def _backtest_regime_walk_forward(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    return _print_json(
        build_regime_walk_forward_report(
            bars,
            config,
            data_hash=data_hash,
            max_workers=args.max_workers,
        )
    )


def _backtest_official_explorer(args: argparse.Namespace) -> int:
    config = load_strategy_config(args.profile, initial_capital=args.initial_capital)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    return _print_json(build_official_explorer(bars, config, data_hash=data_hash))


def _worker_strategy_ranking_daemon(args: argparse.Namespace) -> int:
    return run_strategy_ranking_pool_daemon(
        max_workers=args.max_workers,
        idle_timeout_seconds=args.idle_timeout_seconds,
    )


def _backtest_official_matrix(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    combos = tuple(
        (thread_count, stop_sessions)
        for thread_count in _parse_combo_csv(args.threads)
        for stop_sessions in _parse_combo_csv(args.stops)
    )
    return _print_json(build_official_matrix(bars, config, data_hash=data_hash, combos=combos))


def _backtest_thread_timeline(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    sliced_bars = filter_bars_to_slice(
        bars,
        slice_start=date.fromisoformat(args.slice_start) if args.slice_start else None,
        slice_end=date.fromisoformat(args.slice_end) if args.slice_end else None,
    )
    return _print_json(
        build_thread_timeline(
            sliced_bars,
            config,
            strategy_id=args.strategy_id,
            data_hash=data_hash,
            catalog_id=args.catalog_id,
            execution_model=args.execution_model,
            price_basis=args.price_basis,
        )
    )


def _backtest_mentor_matrix(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    bars, data_hash = _load_bars(_resolve_csv_path(args.csv, args.symbol or config.symbol), args.symbol or config.symbol)
    combos = tuple(
        (thread_count, stop_sessions)
        for thread_count in _parse_combo_csv(args.threads)
        for stop_sessions in _parse_combo_csv(args.stops)
    )
    payload = build_mentor_matrix(
        bars,
        config,
        data_hash=data_hash,
        reference=load_mentor_matrix_reference(args.reference) if args.reference else None,
        combos=combos,
        windows=_parse_windows(args.windows),
    )
    return _print_json(payload)


def _parity_report(args: argparse.Namespace) -> int:
    reference = load_reference_fixture(args.reference)
    bars, data_hash = _load_bars(args.csv, args.symbol)
    config = load_strategy_config(args.profile, initial_capital=args.initial_capital)
    run = run_backtest(bars, config, data_hash=data_hash)
    data_result = check_data_parity(bars, reference)
    profile_key = args.profile_key or f"{config.thread_count}x{config.stop_sessions}"
    event_result = check_event_parity(run, reference, profile_key)
    performance_result = check_performance_parity(run, reference, profile_key)
    payload = {
        "run_id": run.run_id,
        "data_hash": data_hash,
        "profile_key": profile_key,
        "data_parity": {
            "status": data_result.status,
            "details": data_result.details,
            "first_mismatch": data_result.first_mismatch,
        },
        "event_parity": {
            "status": event_result.status,
            "details": event_result.details,
            "first_mismatch": event_result.first_mismatch,
        },
        "performance_parity": {
            "status": performance_result.status,
            "details": performance_result.details,
            "first_mismatch": performance_result.first_mismatch,
        },
    }
    _print_json(payload)
    return _parity_exit_code(data_result, event_result, performance_result)


def _profile_show(args: argparse.Namespace) -> int:
    config = _load_strategy_config_with_overrides(args)
    return _print_json(_serialize_config(config))


def _worker_smoke(_args: argparse.Namespace) -> int:
    repo = InMemoryJobRepository()
    job = BacktestJob(job_id="smoke-job", config_hash="cfg", data_hash="data")
    repo.add(job)
    run_id = run_once(repo, "smoke-worker", lambda _job_id: new_run_id())
    return _print_json({"job_id": job.job_id, "status": repo.jobs[job.job_id].status, "run_id": run_id})


def main() -> int:
    parser = argparse.ArgumentParser(prog="buy-low-sell-high")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap_parser = subparsers.add_parser("bootstrap-check")
    bootstrap_parser.set_defaults(handler=lambda _args: bootstrap_check())

    data_parser = subparsers.add_parser("data")
    data_subparsers = data_parser.add_subparsers(dest="data_command", required=True)
    data_validate = data_subparsers.add_parser("validate")
    _add_csv_argument(data_validate)
    data_validate.add_argument("--symbol", default="SOXL")
    data_validate.set_defaults(handler=_data_validate)
    data_sync = data_subparsers.add_parser("sync")
    data_sync.add_argument("--output-csv")
    data_sync.add_argument("--symbol", default="SOXL")
    data_sync.add_argument("--start-date")
    data_sync.set_defaults(handler=_data_sync)
    data_status = data_subparsers.add_parser("status")
    _add_csv_argument(data_status)
    data_status.add_argument("--symbol", default="SOXL")
    data_status.set_defaults(handler=_data_status)

    automation_parser = subparsers.add_parser("automation")
    automation_subparsers = automation_parser.add_subparsers(dest="automation_command", required=True)
    automation_refresh_market_parser = automation_subparsers.add_parser("refresh-market")
    automation_refresh_market_parser.add_argument("--market", choices=["kr", "us"], required=True)
    automation_refresh_market_parser.add_argument("--skip-materialize", action="store_true")
    automation_refresh_market_parser.add_argument("--force-materialize", action="store_true")
    automation_refresh_market_parser.add_argument("--max-sync-workers", type=int, default=4)
    automation_refresh_market_parser.add_argument("--max-materialize-workers", type=int, default=8)
    automation_refresh_market_parser.add_argument("--sweep-max-workers", type=int, default=0)
    automation_refresh_market_parser.add_argument("--sweep-chunk-size", type=int, default=0)
    automation_refresh_market_parser.set_defaults(handler=_automation_refresh_market)

    backtest_parser = subparsers.add_parser("backtest")
    backtest_subparsers = backtest_parser.add_subparsers(dest="backtest_command", required=True)
    backtest_run_parser = backtest_subparsers.add_parser("run")
    backtest_run_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_run_parser)
    backtest_run_parser.add_argument("--symbol")
    backtest_run_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(backtest_run_parser)
    backtest_run_parser.set_defaults(handler=_backtest_run)
    backtest_detail_parser = backtest_subparsers.add_parser("detail")
    backtest_detail_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_detail_parser)
    backtest_detail_parser.add_argument("--symbol")
    backtest_detail_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(backtest_detail_parser)
    backtest_detail_parser.set_defaults(handler=_backtest_detail)
    backtest_grid_parser = backtest_subparsers.add_parser("grid")
    backtest_grid_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_grid_parser)
    backtest_grid_parser.add_argument("--symbol")
    backtest_grid_parser.add_argument("--threads", required=True)
    backtest_grid_parser.add_argument("--stops", required=True)
    backtest_grid_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(backtest_grid_parser, include_thread_count=False, include_stop_sessions=False)
    backtest_grid_parser.set_defaults(handler=_backtest_grid)
    backtest_risk_parser = backtest_subparsers.add_parser("risk-report")
    backtest_risk_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_risk_parser)
    backtest_risk_parser.add_argument("--symbol")
    backtest_risk_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(backtest_risk_parser)
    backtest_risk_parser.set_defaults(handler=_backtest_risk_report)
    backtest_strategy_explorer_parser = backtest_subparsers.add_parser("strategy-explorer")
    backtest_strategy_explorer_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_strategy_explorer_parser)
    backtest_strategy_explorer_parser.add_argument("--symbol")
    backtest_strategy_explorer_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_strategy_explorer_parser.add_argument("--catalog-id", default="core_profiles_v2")
    backtest_strategy_explorer_parser.add_argument(
        "--execution-model",
        default="next_open",
        choices=["ideal_same_close", "next_open", "next_close"],
    )
    backtest_strategy_explorer_parser.add_argument(
        "--price-basis",
        default="adjusted_close",
        choices=["adjusted_close", "raw_close_with_actions"],
    )
    _add_strategy_override_arguments(backtest_strategy_explorer_parser, include_price_basis=False)
    backtest_strategy_explorer_parser.set_defaults(handler=_backtest_strategy_explorer)
    backtest_strategy_ranking_parser = backtest_subparsers.add_parser("strategy-ranking")
    backtest_strategy_ranking_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_strategy_ranking_parser)
    backtest_strategy_ranking_parser.add_argument("--symbol")
    backtest_strategy_ranking_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_strategy_ranking_parser.add_argument("--slice-start")
    backtest_strategy_ranking_parser.add_argument("--slice-end")
    backtest_strategy_ranking_parser.add_argument("--limit", type=int, default=10)
    backtest_strategy_ranking_parser.add_argument("--max-workers", type=int, default=1)
    backtest_strategy_ranking_parser.add_argument(
        "--execution-model",
        default="ideal_same_close",
        choices=["ideal_same_close", "next_open", "next_close"],
    )
    backtest_strategy_ranking_parser.add_argument(
        "--price-basis",
        default="adjusted_close",
        choices=["adjusted_close", "raw_close_with_actions"],
    )
    _add_strategy_override_arguments(
        backtest_strategy_ranking_parser,
        include_thread_count=False,
        include_stop_sessions=False,
        include_price_basis=False,
    )
    backtest_strategy_ranking_parser.set_defaults(handler=_backtest_strategy_ranking)
    backtest_strategy_detail_parser = backtest_subparsers.add_parser("strategy-detail")
    backtest_strategy_detail_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_strategy_detail_parser)
    backtest_strategy_detail_parser.add_argument("--symbol")
    backtest_strategy_detail_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_strategy_detail_parser.add_argument("--strategy-id", required=True)
    backtest_strategy_detail_parser.add_argument("--slice-start")
    backtest_strategy_detail_parser.add_argument("--slice-end")
    backtest_strategy_detail_parser.add_argument(
        "--execution-model",
        default="ideal_same_close",
        choices=["ideal_same_close", "next_open", "next_close"],
    )
    backtest_strategy_detail_parser.add_argument(
        "--price-basis",
        default="adjusted_close",
        choices=["adjusted_close", "raw_close_with_actions"],
    )
    _add_strategy_override_arguments(
        backtest_strategy_detail_parser,
        include_thread_count=False,
        include_stop_sessions=False,
        include_price_basis=False,
    )
    backtest_strategy_detail_parser.set_defaults(handler=_backtest_strategy_detail)
    backtest_parameter_sweep_parser = backtest_subparsers.add_parser("parameter-sweep")
    backtest_parameter_sweep_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_parameter_sweep_parser)
    backtest_parameter_sweep_parser.add_argument("--symbol")
    backtest_parameter_sweep_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_parameter_sweep_parser.add_argument("--sweep-id", default="core4_v4")
    backtest_parameter_sweep_parser.add_argument("--max-workers", type=int, default=0)
    backtest_parameter_sweep_parser.add_argument("--chunk-size", type=int, default=0)
    backtest_parameter_sweep_parser.add_argument("--dry-run", action="store_true")
    backtest_parameter_sweep_parser.add_argument(
        "--execution-model",
        default="next_open",
        choices=["ideal_same_close", "next_open", "next_close"],
    )
    backtest_parameter_sweep_parser.add_argument(
        "--price-basis",
        default="adjusted_close",
        choices=["adjusted_close", "raw_close_with_actions"],
    )
    _add_strategy_override_arguments(
        backtest_parameter_sweep_parser,
        include_thread_count=False,
        include_stop_sessions=False,
        include_price_basis=False,
    )
    backtest_parameter_sweep_parser.set_defaults(handler=_backtest_parameter_sweep)
    backtest_regime_walk_forward_parser = backtest_subparsers.add_parser("regime-walk-forward")
    backtest_regime_walk_forward_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_regime_walk_forward_parser)
    backtest_regime_walk_forward_parser.add_argument("--symbol")
    backtest_regime_walk_forward_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_regime_walk_forward_parser.add_argument("--max-workers", type=int, default=1)
    backtest_regime_walk_forward_parser.add_argument("--regime-symbol")
    backtest_regime_walk_forward_parser.add_argument("--regime-csv-path")
    backtest_regime_walk_forward_parser.set_defaults(handler=_backtest_regime_walk_forward)
    backtest_official_explorer_parser = backtest_subparsers.add_parser("official-explorer")
    backtest_official_explorer_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_official_explorer_parser)
    backtest_official_explorer_parser.add_argument("--symbol")
    backtest_official_explorer_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_official_explorer_parser.set_defaults(handler=_backtest_official_explorer)
    backtest_official_matrix_parser = backtest_subparsers.add_parser("official-matrix")
    backtest_official_matrix_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_official_matrix_parser)
    backtest_official_matrix_parser.add_argument("--symbol")
    backtest_official_matrix_parser.add_argument("--threads", default="5,6,7")
    backtest_official_matrix_parser.add_argument("--stops", default="30,40")
    backtest_official_matrix_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(backtest_official_matrix_parser, include_thread_count=False, include_stop_sessions=False)
    backtest_official_matrix_parser.set_defaults(handler=_backtest_official_matrix)
    backtest_thread_timeline_parser = backtest_subparsers.add_parser("thread-timeline")
    backtest_thread_timeline_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_thread_timeline_parser)
    backtest_thread_timeline_parser.add_argument("--symbol")
    backtest_thread_timeline_parser.add_argument("--strategy-id", required=True)
    backtest_thread_timeline_parser.add_argument("--catalog-id", default="core_profiles_v2")
    backtest_thread_timeline_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_thread_timeline_parser.add_argument("--slice-start")
    backtest_thread_timeline_parser.add_argument("--slice-end")
    backtest_thread_timeline_parser.add_argument(
        "--execution-model",
        default="ideal_same_close",
        choices=["ideal_same_close", "next_open", "next_close"],
    )
    backtest_thread_timeline_parser.add_argument(
        "--price-basis",
        default="adjusted_close",
        choices=["adjusted_close", "raw_close_with_actions"],
    )
    _add_strategy_override_arguments(
        backtest_thread_timeline_parser,
        include_thread_count=False,
        include_stop_sessions=False,
        include_price_basis=False,
    )
    backtest_thread_timeline_parser.set_defaults(handler=_backtest_thread_timeline)
    backtest_mentor_matrix_parser = backtest_subparsers.add_parser("mentor-matrix")
    backtest_mentor_matrix_parser.add_argument("--profile", required=True)
    _add_csv_argument(backtest_mentor_matrix_parser)
    backtest_mentor_matrix_parser.add_argument("--symbol")
    backtest_mentor_matrix_parser.add_argument("--threads", default="5,6,7")
    backtest_mentor_matrix_parser.add_argument("--stops", default="30,40")
    backtest_mentor_matrix_parser.add_argument("--windows")
    backtest_mentor_matrix_parser.add_argument("--reference")
    backtest_mentor_matrix_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(backtest_mentor_matrix_parser, include_thread_count=False, include_stop_sessions=False)
    backtest_mentor_matrix_parser.set_defaults(handler=_backtest_mentor_matrix)

    parity_parser = subparsers.add_parser("parity")
    parity_subparsers = parity_parser.add_subparsers(dest="parity_command", required=True)
    parity_report_parser = parity_subparsers.add_parser("report")
    parity_report_parser.add_argument("--reference", required=True)
    parity_report_parser.add_argument("--profile", required=True)
    parity_report_parser.add_argument("--csv", required=True)
    parity_report_parser.add_argument("--symbol", default="SOXL")
    parity_report_parser.add_argument("--profile-key")
    parity_report_parser.add_argument("--initial-capital", type=float, default=10000.0)
    parity_report_parser.set_defaults(handler=_parity_report)

    profile_parser = subparsers.add_parser("profile")
    profile_subparsers = profile_parser.add_subparsers(dest="profile_command", required=True)
    profile_show_parser = profile_subparsers.add_parser("show")
    profile_show_parser.add_argument("--profile", required=True)
    profile_show_parser.add_argument("--initial-capital", type=float, default=10000.0)
    _add_strategy_override_arguments(profile_show_parser)
    profile_show_parser.set_defaults(handler=_profile_show)

    worker_parser = subparsers.add_parser("worker")
    worker_subparsers = worker_parser.add_subparsers(dest="worker_command", required=True)
    worker_smoke_parser = worker_subparsers.add_parser("smoke")
    worker_smoke_parser.set_defaults(handler=_worker_smoke)
    worker_strategy_ranking_daemon_parser = worker_subparsers.add_parser("strategy-ranking-daemon")
    worker_strategy_ranking_daemon_parser.add_argument("--max-workers", type=int, default=8)
    worker_strategy_ranking_daemon_parser.add_argument("--idle-timeout-seconds", type=int, default=3600)
    worker_strategy_ranking_daemon_parser.set_defaults(handler=_worker_strategy_ranking_daemon)

    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
