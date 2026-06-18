# Strategy Policy

## Product Boundary
- SOXL daily data only
- Research, parity, dashboard, and manual ledger only
- No broker integration
- No automatic order submission
- No Redis, Bybit, or Telegram trading commands

## Implementation Principles
- Use exchange sessions, not calendar days, for holding age.
- Preserve reference integrity: do not alter fixtures to hide mismatches.
- Separate `ideal_same_close` research outputs from realistic manual execution outputs.

