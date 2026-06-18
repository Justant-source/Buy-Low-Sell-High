# Data Model

Current repository coverage:

- Versioned SOXL market bars are represented in Python and imported from CSV fixtures.
- A PostgreSQL migration skeleton exists in `db/migrations/0001_initial.sql`.
- Manual fills remain separate from simulated backtests.
- Every backtest run already computes `config_hash` and `data_hash`.
