# SOXL-Mania

SOXL-Mania is a clean-room research and manual decision-support stack for the SOXL daily-close "ddeolsao-pal" strategy. It excludes broker automation, Redis, and exchange-specific execution code by design.

## Current Scope
- Python engine, Docker runtime, and safety guardrails are implemented.
- SOXL daily history can be synced from 2011-01-01 onward into the canonical local CSV snapshot at `data/raw/soxl_daily_2011_present.csv`.
- Network sync currently falls back in the order `Yahoo chart -> Investing historical API -> Stooq`.
- Strategy logic, parity fixtures, and manual ledger workflows are available in the Python CLI.
- The Express dashboard now serves Bit-Mania-style `monitor`, `backtests`, and `manual` pages backed by CLI-driven API routes and file-backed dashboard jobs.

## 8 Workstreams
1. Foundation and safety guardrails
2. Market data pipeline and exchange-session calendar
3. Deterministic capital-thread strategy engine
4. Backtest engine, metrics, and parameter sweep
5. Mentor reference fixture and parity calibration
6. PostgreSQL persistence and job worker
7. Dashboard APIs and comparison UI
8. Manual ledger, recommendations, risk views, and release hardening

## Repository Layout
- `engine/`: Python package for the strategy and backtest engine
- `dashboard/`: TypeScript Express dashboard, static multi-page UI, and CLI-backed API routes
- `db/`: migrations placeholder
- `docs/`: architecture, policy, and planning documents
- `scripts/`: static verification and documentation checks

## Core Commands
```bash
make bootstrap-check
make lint-docs
python3 scripts/verify_no_autotrading.py
PYTHONPATH=engine/src python3 -m soxl_mania.cli data sync --symbol SOXL --start-date 2011-01-01
PYTHONPATH=engine/src python3 -m soxl_mania.cli backtest run --profile configs/strategies/mentor_default_5x30.yaml --symbol SOXL
```

## Docker
```bash
./scripts/docker_init.sh
./scripts/docker_sync_soxl.sh
./scripts/docker_backtest_soxl.sh
```

Docker helper containers use the `soxlmania-` prefix, including `soxlmania-postgres`, `soxlmania-dashboard`, `soxlmania-engine-sync`, and `soxlmania-engine-backtest`.

## Dashboard Routes
- `http://localhost:3000/monitor`
- `http://localhost:3000/backtests`
- `http://localhost:3000/manual`

The default landing page is `/backtests`.

## Notes
- `env/` contains legacy environment artifacts and is not part of the SOXL-Mania runtime.
- The implementation source of truth is [`.request/SOXL_MANIA_CODEX_IMPLEMENTATION_PLAN.md`](./.request/SOXL_MANIA_CODEX_IMPLEMENTATION_PLAN.md).
