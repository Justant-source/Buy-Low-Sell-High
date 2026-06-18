# SOXL-Mania Agent Guide

## Read First
1. `docs/_index.md`
2. `docs/70-policy/strategy.md`
3. `.request/SOXL_MANIA_CODEX_IMPLEMENTATION_PLAN.md`

## Product Boundary
- Research, dashboard, and manual ledger only.
- Never add broker order submission, automatic trading, Redis, Bybit, or Telegram trading commands.
- A recommendation is not a fill. Keep simulated and manual records separate.

## Reference Integrity
- Do not edit mentor reference fixtures to make tests pass.
- Do not claim parity when `data_hash` differs.
- Log the first mismatching session and document semantic changes in an ADR.

## Engineering Rules
- Use `Decimal` for money and quantity in the core engine.
- Count holding age with exchange sessions, not calendar days.
- Every run stores `config_hash`, `data_hash`, and code commit.
- No network in unit, property, golden, or reference tests.
- PostgreSQL is the only shared runtime store; no Redis.
- Update docs in the same commit as code.

## Workflow
- Work on one plan Phase at a time.
- Do not implement later-phase features unless required by the current Phase.
- Run the Phase Gate commands and report the results.
- Never skip or weaken failing tests.

