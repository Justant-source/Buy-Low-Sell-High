# Buy-Low-Sell-High Agent Guide

## Read First
1. `docs/_index.md`
2. `docs/70-policy/strategy.md`
3. `.request/BUY_LOW_SELL_HIGH_CODEX_IMPLEMENTATION_PLAN.md`

## Product Boundary
- Research and dashboard backtesting only.
- Never add broker order submission, automatic trading, Redis, Bybit, or Telegram trading commands.
- Keep the product boundary limited to simulation, analytics, and reproducible backtest outputs.

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
- Default to parallel execution for independent work. Use up to 8 parallel sub-agents/tool tasks when the work can be safely split.
- Run the Phase Gate commands and report the results.
- Never skip or weaken failing tests.
