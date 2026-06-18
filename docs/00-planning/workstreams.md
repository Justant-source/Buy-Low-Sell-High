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
- Workstreams `7-8` are skeletonized at the dashboard/API layer; full Node-based execution is blocked in the current environment because `node` is not installed.
