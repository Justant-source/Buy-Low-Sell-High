#!/usr/bin/env bash
set -euo pipefail

./scripts/check_docker_access.sh

SYMBOL="${1:-SOXL}"
OUTPUT_CSV="${2:-}"

CMD=(
  docker compose run --rm \
  --name buylowsellhigh-engine-sync \
  --no-deps \
  engine-cli \
  python -m buy_low_sell_high.cli data sync \
  --symbol "${SYMBOL}" \
)

if [[ -n "${OUTPUT_CSV}" ]]; then
  CMD+=(--output-csv "${OUTPUT_CSV}")
fi

"${CMD[@]}"
