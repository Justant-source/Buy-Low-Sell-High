# Workstreams

This repository is organized for eight parallel workstreams derived from the implementation plan.

## Active Breakdown
1. Foundation: repository rules, docs SSOT, CI, safety verification
2. Data: SOXL EOD imports, manifests, exchange-session calendar
3. Strategy: capital-thread domain model and deterministic state machine
4. Backtest: execution models, metrics, yearly summaries, sweep
5. Parity: mentor reference fixture, reports, semantic calibration ADRs
6. Persistence: PostgreSQL schema, jobs, worker, caching, reproducibility
7. Dashboard: REST API, comparison matrix, exports, freshness indicators
8. Manual Operations: recommendations, ledger, reversal, risk and release hardening

## Delivery Rule
- Implement Phase 0 fully before parallelizing later work.
- Keep each future commit scoped to a single Phase Gate.

## Current Status
- Workstreams `1-5` have executable Python scaffolding and tests in this repository.
- Workstream `6` has schema SQL plus an in-memory worker/repository used for smoke and deterministic tests.
- Workstreams `7-8` now include an implemented Express dashboard, Bit-Mania-style multi-page UI, CLI-backed APIs, and file-backed dashboard job artifacts.
- Local TypeScript verification is now executable via `npm --prefix dashboard run build` and `npm --prefix dashboard test`.
- Local dashboard smoke flows are now executable via `make e2e-backtest`, `make e2e-manual`, and `make e2e-risk`.
- Phase 8 risk reporting now has an executable local path via `make scenario-report` and `make e2e-risk`.
- Phase 9 backup and aggregate local gates are now executable via `make backup`, `make backup-restore-test`, `make clean-room`, and `make ci`.
- Docker CLI can now be installed locally in this environment, but Dockerized runtime verification may still be blocked if the snap session cannot access `/var/run/docker.sock`.
