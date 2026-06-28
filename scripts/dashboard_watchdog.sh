#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="${DASHBOARD_WATCHDOG_HEALTH_URL:-http://127.0.0.1:3232/api/health}"
PAGE_URL="${DASHBOARD_WATCHDOG_PAGE_URL:-http://127.0.0.1:3232/backtests/soxl}"
MAX_RSS_BYTES="${DASHBOARD_WATCHDOG_MAX_RSS_BYTES:-1500000000}"
EXPECTED_ACTIVE="${DASHBOARD_WATCHDOG_EXPECTED_ACTIVE:-soxl,0193t0}"
UNIT_NAME="${DASHBOARD_WATCHDOG_UNIT_NAME:-buy-low-sell-high-dashboard.service}"

health_payload="$(curl -fsS --max-time 5 "${HEALTH_URL}")"
curl -fsS --max-time 5 -o /dev/null "${PAGE_URL}"

HEALTH_PAYLOAD="${health_payload}" \
MAX_RSS_BYTES="${MAX_RSS_BYTES}" \
EXPECTED_ACTIVE="${EXPECTED_ACTIVE}" \
python3 - <<'PY'
from __future__ import annotations

import json
import os
import sys

payload = json.loads(os.environ["HEALTH_PAYLOAD"])
diagnostics = payload.get("diagnostics") or {}
process = diagnostics.get("process") or {}
rss_bytes = int(process.get("rssBytes") or 0)
if rss_bytes <= 0:
    raise SystemExit("missing rssBytes")
max_rss_bytes = int(os.environ["MAX_RSS_BYTES"])
if rss_bytes > max_rss_bytes:
    raise SystemExit(f"rss too high: {rss_bytes} > {max_rss_bytes}")

active_workspaces = {row.get("workspaceId") for row in diagnostics.get("activeWorkspaces") or []}
expected_active = {
    value.strip() for value in os.environ["EXPECTED_ACTIVE"].split(",") if value.strip()
}
if expected_active and active_workspaces != expected_active:
    raise SystemExit(
        f"active workspace mismatch: got={sorted(active_workspaces)} expected={sorted(expected_active)}"
    )
PY

exit 0
