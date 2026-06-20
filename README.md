# Buy-Low-Sell-High

Buy-Low-Sell-High is a clean-room backtesting stack for daily-close "ddeolsao-pal" research. It excludes broker automation, monitor/manual-ledger workflows, Redis, and exchange-specific execution code by design.

## Current Scope
- Python engine, Docker runtime, and safety guardrails are implemented.
- Symbol snapshots follow `data/raw/{symbol_lower}_daily_2011_present.csv`.
- SOXL remains the default workspace and reference dataset at `data/raw/soxl_daily_2011_present.csv`.
- Network sync currently falls back in the order `Yahoo chart -> Investing historical API -> Stooq`.
- Strategy logic, parity fixtures, and symbol-aware backtest workflows are available in the Python CLI.
- The Express dashboard serves workspace-based backtest pages at `/backtests/:symbolSlug`.
- The `backtests` workspace includes `Strategy Explorer`, `Sweep Explorer`, official SOXL reference views, and risk comparison.
- Ongoing UI and methodology reference must continue to use `/home/justant/Data/Bit-Mania`, especially `/home/justant/Data/Bit-Mania/backtest/dashboards/strategy_dashboard.html` and `/home/justant/Data/Bit-Mania/backtest/dashboards/supertrend_sweep_dashboard.html`.

## 8 Workstreams
1. Foundation and safety guardrails
2. Market data pipeline and exchange-session calendar
3. Deterministic capital-thread strategy engine
4. Backtest engine, metrics, and parameter sweep
5. Mentor reference fixture and parity calibration
6. PostgreSQL persistence and job worker
7. Dashboard APIs and comparison UI
8. Workspace routing, risk views, and release hardening

## Repository Layout
- `engine/`: Python package for the strategy and backtest engine
- `dashboard/`: TypeScript Express dashboard, static multi-page UI, and CLI-backed API routes
- `db/`: PostgreSQL migrations for runtime tables and backtest research artifacts
- `docs/`: architecture, policy, and planning documents
- `scripts/`: static verification and documentation checks

## Core Commands
```bash
make bootstrap-check
make lint-docs
make scenario-report
make e2e-backtest
make e2e-risk
make clean-room
make ci
npm --prefix dashboard run build
npm --prefix dashboard test
python3 scripts/verify_no_autotrading.py
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli data sync --symbol SOXL --start-date 2011-01-01
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest run --profile configs/strategies/soxl_default_5x30.yaml --symbol SOXL
```

## Docker
```bash
./scripts/docker_init.sh
./scripts/docker_sync_symbol.sh
./scripts/docker_backtest_default.sh
./scripts/migrate_to_wsl_server.sh
```

Docker helper containers use the `buylowsellhigh-` prefix, including `buylowsellhigh-postgres`, `buylowsellhigh-dashboard`, `buylowsellhigh-engine-sync`, and `buylowsellhigh-engine-backtest`.

The dashboard container expects `DATABASE_URL` so `Strategy Explorer` and `Sweep Explorer` artifacts can be persisted in PostgreSQL.

In the current Codex snap environment, the Docker CLI can be installed locally, but daemon access may still be blocked at `/var/run/docker.sock` by confinement rules.

## Dashboard Routes
- Default dashboard port: `3232`
- `http://localhost:3232/backtests`
- `http://localhost:3232/backtests/soxl`

The default landing page redirects to `/backtests/soxl`.

## Notes
- `env/` contains legacy environment artifacts and is not part of the Buy-Low-Sell-High runtime.
- The implementation source of truth is [`.request/BUY_LOW_SELL_HIGH_CODEX_IMPLEMENTATION_PLAN.md`](./.request/BUY_LOW_SELL_HIGH_CODEX_IMPLEMENTATION_PLAN.md).
