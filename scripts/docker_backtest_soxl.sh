#!/usr/bin/env bash
set -euo pipefail

./scripts/check_docker_access.sh

docker compose run --rm \
  --name soxlmania-engine-backtest \
  --no-deps \
  engine-cli \
  python -m soxl_mania.cli backtest run \
  --profile "${1:-configs/strategies/mentor_default_5x30.yaml}" \
  --csv "${2:-data/raw/soxl_daily_2011_present.csv}" \
  --symbol SOXL
