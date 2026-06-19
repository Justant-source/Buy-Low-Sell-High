# Work Order: Mentor Reference Matrix

## Scope
- Reproduce the mentor backtest image on `/backtests` with the authoritative reference matrix.
- Keep the product boundary unchanged: research, dashboard, and manual ledger only.
- Do not add broker execution, automatic trading, Redis, Bybit, or Telegram commands.

## Authority
- The mentor image is the authoritative reference fixture.
- Do not edit the fixture to hide mismatches.
- Do not claim parity when `data_hash` differs.
- Log the first mismatching session or cell and record semantic changes in ADRs.

## Screen Contract
- Render the 2011-2024 yearly matrix for `threads={5,6,7}` and `stops={10,30,40}`.
- Render aggregate rows for yearly standard deviation, yearly averages, simple returns, compound returns, and selected take-profit/time-stop counts.
- Keep the mentor display structure aligned with the image: benchmark columns, 9 strategy columns, aggregate rows, and selected count tables.

## Semantic Baseline
- Block B yearly returns: per-year independent runs on a $10,000 base.
- Block C aggregates: continuous carry runs with `simple=fixed_principal` and `compound=thread_compound`.
- Windows:
  - `total`: 2011-2024
  - `y5`: 2020-2024
  - `y3`: 2022-2024
  - `y1`: 2024
- Counts:
  - Yearly count rows follow the same per-year independent runs.
  - Aggregate count rows follow the matching continuous or per-year family.

## Deliverables
1. Locked reference fixture at `engine/tests/fixtures/mentor_reference_matrix.yaml`
2. ADR `docs/90-adr/0002-mentor-reference-screen.md`
3. Engine and CLI support for mentor matrix payloads
4. Dashboard API and UI rendering on `/backtests`
5. Parity harness that reports exact first mismatches without weakening tests

## Gates
- `make lint-docs`
- `python3 -m unittest discover -s engine/tests/unit -p 'test_*.py'`
- `npm --prefix dashboard run build`
- `python3 scripts/verify_no_autotrading.py`
- Final parity gate only passes when fixture cells match within documented tolerances and the data snapshot hash matches the authoritative reference dataset.
