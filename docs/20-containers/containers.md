# Containers

- `postgres`: runtime store for market data, backtests, jobs, and manual ledger
- `engine-worker`: Phase 5 smoke-test service kept in Compose but not started by `scripts/docker_init.sh`
- `engine-cli`: on-demand Python CLI container used for SOXL sync and backtests
- `dashboard`: TypeScript Express API and static UI host for `/monitor`, `/backtests`, and `/manual`

Redis is intentionally excluded.

Container names must use the `soxlmania-` prefix. One-shot helper containers use explicit names such as `soxlmania-engine-sync` and `soxlmania-engine-backtest`.
