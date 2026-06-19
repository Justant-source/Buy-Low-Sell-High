#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"
  exit 1
fi

docker compose run --rm \
  --name soxlmania-engine-sync \
  --no-deps \
  engine-cli \
  python -m soxl_mania.cli data sync \
  --output-csv "${1:-data/raw/soxl_daily_2011_present.csv}" \
  --symbol SOXL \
  --start-date 2011-01-01
