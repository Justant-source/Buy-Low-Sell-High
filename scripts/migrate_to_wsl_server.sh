#!/usr/bin/env bash
set -euo pipefail

SERVER="${SERVER:-justant@100.115.252.61}"
REMOTE_DIR="${REMOTE_DIR:-/home/justant/Data/Buy-Low-Sell-High}"
REPO_URL="${REPO_URL:-https://github.com/Justant-source/Buy-Low-Sell-High.git}"
LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/4] prepare remote directory"
ssh "${SERVER}" "mkdir -p '${REMOTE_DIR}'"

echo "[2/4] clone or update tracked repository files"
ssh "${SERVER}" "
  if [ -d '${REMOTE_DIR}/.git' ]; then
    cd '${REMOTE_DIR}'
    git fetch origin main
    git checkout main
    git pull --ff-only origin main
  else
    rm -rf '${REMOTE_DIR}'
    git clone '${REPO_URL}' '${REMOTE_DIR}'
  fi
"

echo "[3/4] sync local-only runtime assets"
scp -p "${LOCAL_ROOT}/data/raw/soxl_daily_2011_present.csv" \
  "${SERVER}:${REMOTE_DIR}/data/raw/soxl_daily_2011_present.csv"

echo "[4/4] show remote status"
ssh "${SERVER}" "cd '${REMOTE_DIR}' && git status --short && ls -lh data/raw/soxl_daily_2011_present.csv"
