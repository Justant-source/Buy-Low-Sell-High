#!/usr/bin/env bash
set -euo pipefail

./scripts/check_docker_access.sh

PROFILE_PATH="${1:-configs/strategies/soxl_default_5x30.yaml}"
CSV_PATH="${2:-data/raw/soxl_daily_2011_present.csv}"
SYMBOL="${3:-SOXL}"

docker compose run --rm \
  --name buylowsellhigh-engine-backtest \
  --no-deps \
  engine-cli \
  python -m buy_low_sell_high.cli backtest run \
  --profile "${PROFILE_PATH}" \
  --csv "${CSV_PATH}" \
  --symbol "${SYMBOL}"
