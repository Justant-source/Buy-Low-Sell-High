# Buy-Low-Sell-High

Buy-Low-Sell-High is a clean-room backtesting stack for daily-close "ddeolsao-pal" research. It excludes broker automation, monitor/manual-ledger workflows, Redis, and exchange-specific execution code by design.

## Current Scope
- Python engine, Docker runtime, and safety guardrails are implemented.
- Symbol snapshots follow the symbol registry filename, including `soxl_daily_2011_present.csv`, `tqqq_daily_2011_present.csv`, `000660_daily_2015_present.csv`, `0193t0_daily_2015_present.csv`, `233740_daily_2015_present.csv`, and `462330_daily_2023_present.csv`.
- SOXL remains the default workspace and reference dataset at `data/raw/soxl_daily_2011_present.csv`.
- `TQQQ` uses Yahoo-adjusted daily history as the canonical `data/raw/tqqq_daily_2011_present.csv` snapshot.
- `0193T0` uses Naver daily history plus synthetic pre-listing rows anchored to the actual `2026-05-27` listing-day close.
- `233740` and `462330` use direct Naver daily history snapshots with no synthetic pre-listing rows.
- `0193T0` profiles default to `initial_capital: 10000000` because the canonical dataset is KRW-priced and the SOXL baseline `10000` capital would stop producing whole-share entries once the ETF price exceeds a single thread budget.
- Korean ETF profiles for `0193T0`, `233740`, and `462330` default to `initial_capital: 10000000`.
- Network sync currently uses `Naver` for `000660`/`0193T0`/`233740`/`462330` and falls back in the order `Yahoo chart -> Investing historical API -> Stooq` for SOXL/TQQQ-like symbols.
- Strategy logic, parity fixtures, and symbol-aware backtest workflows are available in the Python CLI.
- The Express dashboard serves workspace-based backtest pages at `/backtests/:symbolSlug`.
- The `backtests` workspace includes `Strategy Explorer`, `Sweep Explorer`, official SOXL/TQQQ reference views, and risk comparison.
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
./scripts/dashboard_exec.sh build
./scripts/dashboard_exec.sh test
PORT=3232 ./scripts/dashboard_exec.sh start
python3 scripts/verify_no_autotrading.py
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli data sync --symbol SOXL
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli data sync --symbol TQQQ
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli data sync --symbol 0193T0
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli data sync --symbol 233740
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli data sync --symbol 462330
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest run --profile configs/strategies/soxl_default_5x30.yaml --symbol SOXL
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest run --profile configs/strategies/tqqq_default_5x30.yaml --symbol TQQQ
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest run --profile configs/strategies/0193t0_default_5x30.yaml --symbol 0193T0
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest run --profile configs/strategies/233740_default_5x30.yaml --symbol 233740
PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest run --profile configs/strategies/462330_default_5x30.yaml --symbol 462330
```

## Dashboard Toolchain
- Always use `./scripts/dashboard_exec.sh` for dashboard build, test, and start commands.
- The script first uses system `node`/`npm` when available.
- If the environment has no working system Node toolchain, it automatically downloads and reuses a local Node `v20.19.5` toolchain under `.tools/`.
- The wrapper also forces `npm --script-shell /bin/bash`, which avoids the `spawn sh ENOENT` failure seen in restricted environments.
- If neither `DATABASE_URL` nor `SQLITE_PATH` is set, the wrapper defaults the dashboard research store to `data/runtime/buy-low-sell-high.sqlite`.
- This requirement is intentional: future agents should not call raw `npm --prefix dashboard ...` unless they have already verified the local environment.

## Docker
```bash
./scripts/docker_init.sh
./scripts/docker_sync_symbol.sh
./scripts/docker_backtest_default.sh
./scripts/migrate_to_wsl_server.sh
```

Docker helper containers use the `buylowsellhigh-` prefix, including `buylowsellhigh-postgres`, `buylowsellhigh-dashboard`, `buylowsellhigh-engine-sync`, and `buylowsellhigh-engine-backtest`.

The dashboard container expects `DATABASE_URL` so `Strategy Explorer` and `Sweep Explorer` artifacts can be persisted in PostgreSQL.
For local non-container runs, the dashboard can persist the same artifacts in `SQLITE_PATH` instead of falling back to in-memory storage.

In the current Codex snap environment, the Docker CLI can be installed locally, but daemon access may still be blocked at `/var/run/docker.sock` by confinement rules.

## Dashboard Routes
- Default dashboard port: `3232`
- `http://localhost:3232/backtests`
- `http://localhost:3232/backtests/soxl`
- `http://localhost:3232/backtests/tqqq`
- `http://localhost:3232/backtests/0193T0`
- `http://localhost:3232/backtests/233740`
- `http://localhost:3232/backtests/462330`

The default landing page redirects to `/backtests/soxl`.

## Notes
- `env/` contains legacy environment artifacts and is not part of the Buy-Low-Sell-High runtime.
- The implementation source of truth is [`.request/BUY_LOW_SELL_HIGH_CODEX_IMPLEMENTATION_PLAN.md`](./.request/BUY_LOW_SELL_HIGH_CODEX_IMPLEMENTATION_PLAN.md).
