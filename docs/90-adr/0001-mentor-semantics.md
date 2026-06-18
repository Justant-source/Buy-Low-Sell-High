# ADR 0001: Mentor Semantics Baseline

## Status
Provisional

## Context
The mentor sheet reference is transcribed, but the exact historical data source and every edge-condition switch are not yet proven by parity.

## Decision
Use `mentor_v1` semantics as the executable baseline:

- Entry on `close < previous_close`
- Maximum one new thread per session
- Default order: exits then entry
- Take profit when `current_close > entry_price`
- Time stop when `holding_sessions >= stop_sessions` and price has not recovered
- Same-session thread reuse allowed by default
- Adjusted close is the default research basis
- `ideal_same_close` is allowed only as a research parity model, not a live expectation model

## Consequences
- The engine is deterministic and testable now.
- A future parity pass may still revise ambiguity switches, but any change must be recorded here instead of being applied silently.
