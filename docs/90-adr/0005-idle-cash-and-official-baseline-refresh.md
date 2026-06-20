# ADR 0005: Idle Cash Preservation and Official Baseline Refresh

## Status
Approved

## Context
The backtest engine enforces whole-share entries. When a thread budget cannot buy one whole share, the engine now records `ENTRY_SKIPPED` instead of raising an exception.

While stabilizing that behavior, we found a second accounting defect: uninvested cash left after a whole-share buy was not preserved in thread equity. That leak distorted fixed-principal returns, collapsed some compound runs, and made the checked-in official golden artifacts irreproducible even though the runtime `data_hash` still matched.

Observed mismatches during the repair:

- first runtime blocker: `Entry budget is insufficient to buy one whole share`
- first official matrix mismatch after skip handling: `combos.5x10.aggregate_count_rows.compound_total.take_profit`
- first official explorer mismatch after idle-cash preservation: `current_catalog_top.full_return_pct`

## Decision
- Keep whole-share sizing as the runtime rule.
- Record `ENTRY_SKIPPED` when the entry budget is below one whole share.
- Preserve each thread's idle cash during open positions and restore it on exit.
- Refresh the official SOXL golden artifacts from the deterministic runtime output produced by:
  - `data_hash = 9c6ca09d2c091a40280f715ca81051d993e0b7803faafc2bb1d92642f74f77d9`
  - `price_basis = adjusted_close`
  - `execution_model = ideal_same_close`
  - `sizing_mode = fixed_principal`
  - `profile_id = soxl_official_ddeolsao_pal_v1`

## Consequences
- The official baseline is reproducible again from checked-in code plus the checked-in SOXL snapshot.
- The current official catalog top remains `5x40`.
- Golden verification now represents the current runtime semantics instead of an irreproducible historical artifact.
