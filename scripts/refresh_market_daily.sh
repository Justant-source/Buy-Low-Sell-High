#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKET=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --market)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --market" >&2
        exit 1
      fi
      MARKET="$2"
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${MARKET}" ]]; then
  echo "usage: $0 --market <kr|us> [extra automation args...]" >&2
  exit 1
fi

LOG_DIR="${ROOT_DIR}/data/runtime/logs"
LOCK_DIR="${ROOT_DIR}/data/runtime/locks"
LOG_FILE="${LOG_DIR}/market-refresh-${MARKET}.log"
LOCK_FILE="${LOCK_DIR}/market-refresh-${MARKET}.lock"

mkdir -p "${LOG_DIR}" "${LOCK_DIR}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "market refresh already running for ${MARKET}" >&2
  exit 0
fi

{
  echo "[$(date -Is)] market refresh start market=${MARKET}"
  set +e
  PYTHONPATH="${ROOT_DIR}/engine/src${PYTHONPATH:+:${PYTHONPATH}}" \
    python3 -m buy_low_sell_high.cli automation refresh-market --market "${MARKET}" "${EXTRA_ARGS[@]}"
  status=$?
  set -e
  echo "[$(date -Is)] market refresh finish market=${MARKET} exit_code=${status}"
  exit "${status}"
} 2>&1 | tee -a "${LOG_FILE}"

exit "${PIPESTATUS[0]}"
