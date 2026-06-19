# Data Model

Current repository coverage:

- Versioned SOXL market bars are represented in Python and imported from CSV fixtures.
- The canonical local SOXL snapshot path is `data/raw/soxl_daily_2011_present.csv`, populated from `2011-01-01` onward.
- Network sync can source the snapshot from Yahoo, Investing, or Stooq, while preserving a versioned CSV snapshot for backtests.
- A PostgreSQL migration skeleton exists in `db/migrations/0001_initial.sql`.
- Manual fills remain separate from simulated backtests.
- Every backtest run already computes `config_hash` and `data_hash`.
