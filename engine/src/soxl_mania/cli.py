from __future__ import annotations

import argparse
import json
from pathlib import Path

from .backtest.engine import run_backtest
from .backtest.parity import check_data_parity, check_event_parity, check_performance_parity, load_reference_fixture
from .backtest.sweep import run_grid
from .config import load_strategy_config
from .data.normalize import normalize_bars
from .data.providers.csv_provider import CsvMarketDataProvider
from .data.quality import compute_data_hash, summarize_import
from .data.sync import sync_soxl_history
from .domain.models import BacktestJob, StrategyConfig, new_run_id
from .manual.recommendation import build_recommendations
from .persistence.repositories import InMemoryJobRepository
from .persistence.worker import run_once


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


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


def _data_validate(args: argparse.Namespace) -> int:
    bars, data_hash = _load_bars(args.csv, args.symbol)
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
    bars, data_hash = _load_bars(args.csv, args.symbol)
    return _print_json(
        {
            "symbol": args.symbol,
            "rows": len(bars),
            "start": bars[0].session_date.isoformat(),
            "end": bars[-1].session_date.isoformat(),
            "data_hash": data_hash,
        }
    )


def _data_sync(args: argparse.Namespace) -> int:
    result = sync_soxl_history(
        args.output_csv,
        symbol=args.symbol,
        start_date=args.start_date,
    )
    return _print_json(result)


def _backtest_run(args: argparse.Namespace) -> int:
    config = load_strategy_config(args.profile, initial_capital=args.initial_capital)
    bars, data_hash = _load_bars(args.csv, args.symbol or config.symbol)
    run = run_backtest(bars, config, data_hash=data_hash)
    return _print_json(
        {
            "run_id": run.run_id,
            "profile_id": config.profile_id,
            "data_hash": run.data_hash,
            "config_hash": config.config_hash(),
            "metrics": {key: str(value) for key, value in run.metrics.items()},
            "yearly": {
                str(year): {metric: str(value) for metric, value in payload.items()}
                for year, payload in run.yearly.items()
            },
        }
    )


def _backtest_grid(args: argparse.Namespace) -> int:
    config = load_strategy_config(args.profile, initial_capital=args.initial_capital)
    bars, data_hash = _load_bars(args.csv, args.symbol or config.symbol)
    thread_counts = [int(item) for item in args.threads.split(",")]
    stop_sessions = [int(item) for item in args.stops.split(",")]
    runs = run_grid(bars, config, thread_counts, stop_sessions, data_hash=data_hash)
    return _print_json(
        [
            {
                "profile_id": run.config.profile_id,
                "thread_count": run.config.thread_count,
                "stop_sessions": run.config.stop_sessions,
                "total_return_pct": str(run.metrics["total_return_pct"]),
                "trade_count": run.metrics["trade_count"],
            }
            for run in runs
        ]
    )


def _parity_report(args: argparse.Namespace) -> int:
    reference = load_reference_fixture(args.reference)
    bars, data_hash = _load_bars(args.csv, args.symbol)
    config = load_strategy_config(args.profile, initial_capital=args.initial_capital)
    run = run_backtest(bars, config, data_hash=data_hash)
    data_result = check_data_parity(bars, reference)
    profile_key = args.profile_key or f"{config.thread_count}x{config.stop_sessions}"
    event_result = check_event_parity(run, reference, profile_key)
    performance_result = check_performance_parity(run, reference, profile_key)
    return _print_json(
        {
            "run_id": run.run_id,
            "data_hash": data_hash,
            "profile_key": profile_key,
            "data_parity": {"status": data_result.status, "details": data_result.details},
            "event_parity": {"status": event_result.status, "details": event_result.details},
            "performance_parity": {"status": performance_result.status, "details": performance_result.details},
        }
    )


def _manual_today(args: argparse.Namespace) -> int:
    config = load_strategy_config(args.profile, initial_capital=args.initial_capital)
    bars, _data_hash = _load_bars(args.csv, args.symbol or config.symbol)
    recommendations = build_recommendations(bars, config, {})
    return _print_json(
        [
            {
                "thread_id": recommendation.thread_id,
                "action": recommendation.action.value,
                "reason": recommendation.reason,
                "basis_price": str(recommendation.basis_price),
                "session_date": recommendation.session_date.isoformat(),
            }
            for recommendation in recommendations
        ]
    )


def _worker_smoke(_args: argparse.Namespace) -> int:
    repo = InMemoryJobRepository()
    job = BacktestJob(job_id="smoke-job", config_hash="cfg", data_hash="data")
    repo.add(job)
    run_id = run_once(repo, "smoke-worker", lambda _job_id: new_run_id())
    return _print_json({"job_id": job.job_id, "status": repo.jobs[job.job_id].status, "run_id": run_id})


def main() -> int:
    parser = argparse.ArgumentParser(prog="soxl-mania")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap_parser = subparsers.add_parser("bootstrap-check")
    bootstrap_parser.set_defaults(handler=lambda _args: bootstrap_check())

    data_parser = subparsers.add_parser("data")
    data_subparsers = data_parser.add_subparsers(dest="data_command", required=True)
    data_validate = data_subparsers.add_parser("validate")
    data_validate.add_argument("--csv", required=True)
    data_validate.add_argument("--symbol", default="SOXL")
    data_validate.set_defaults(handler=_data_validate)
    data_sync = data_subparsers.add_parser("sync")
    data_sync.add_argument("--output-csv", required=True)
    data_sync.add_argument("--symbol", default="SOXL")
    data_sync.add_argument("--start-date", default="2011-01-01")
    data_sync.set_defaults(handler=_data_sync)
    data_status = data_subparsers.add_parser("status")
    data_status.add_argument("--csv", required=True)
    data_status.add_argument("--symbol", default="SOXL")
    data_status.set_defaults(handler=_data_status)

    backtest_parser = subparsers.add_parser("backtest")
    backtest_subparsers = backtest_parser.add_subparsers(dest="backtest_command", required=True)
    backtest_run_parser = backtest_subparsers.add_parser("run")
    backtest_run_parser.add_argument("--profile", required=True)
    backtest_run_parser.add_argument("--csv", required=True)
    backtest_run_parser.add_argument("--symbol")
    backtest_run_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_run_parser.set_defaults(handler=_backtest_run)
    backtest_grid_parser = backtest_subparsers.add_parser("grid")
    backtest_grid_parser.add_argument("--profile", required=True)
    backtest_grid_parser.add_argument("--csv", required=True)
    backtest_grid_parser.add_argument("--symbol")
    backtest_grid_parser.add_argument("--threads", required=True)
    backtest_grid_parser.add_argument("--stops", required=True)
    backtest_grid_parser.add_argument("--initial-capital", type=float, default=10000.0)
    backtest_grid_parser.set_defaults(handler=_backtest_grid)

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

    manual_parser = subparsers.add_parser("manual")
    manual_subparsers = manual_parser.add_subparsers(dest="manual_command", required=True)
    manual_today = manual_subparsers.add_parser("today")
    manual_today.add_argument("--profile", required=True)
    manual_today.add_argument("--csv", required=True)
    manual_today.add_argument("--symbol")
    manual_today.add_argument("--initial-capital", type=float, default=10000.0)
    manual_today.set_defaults(handler=_manual_today)

    worker_parser = subparsers.add_parser("worker")
    worker_subparsers = worker_parser.add_subparsers(dest="worker_command", required=True)
    worker_smoke_parser = worker_subparsers.add_parser("smoke")
    worker_smoke_parser.set_defaults(handler=_worker_smoke)

    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
