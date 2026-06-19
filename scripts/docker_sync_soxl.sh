#!/usr/bin/env bash
set -euo pipefail

./scripts/check_docker_access.sh

docker compose run --rm \
  --name soxlmania-engine-sync \
  --no-deps \
  engine-cli \
  python -m soxl_mania.cli data sync \
  --output-csv "${1:-data/raw/soxl_daily_2011_present.csv}" \
  --symbol SOXL \
  --start-date 2011-01-01
