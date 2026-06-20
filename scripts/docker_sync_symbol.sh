#!/usr/bin/env bash
set -euo pipefail

./scripts/check_docker_access.sh

SYMBOL="${1:-SOXL}"
OUTPUT_CSV="${2:-data/raw/${SYMBOL,,}_daily_2011_present.csv}"

docker compose run --rm \
  --name buylowsellhigh-engine-sync \
  --no-deps \
  engine-cli \
  python -m buy_low_sell_high.cli data sync \
  --output-csv "${OUTPUT_CSV}" \
  --symbol "${SYMBOL}" \
  --start-date 2011-01-01
