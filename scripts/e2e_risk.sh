#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3210}"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "${ROOT_DIR}"

npm --prefix dashboard run build >/dev/null
PORT="${PORT}" node dashboard/dist/server.js >/tmp/buy-low-sell-high-risk-e2e.log 2>&1 &
SERVER_PID="$!"

python3 - <<'PY'
import json
import time
import urllib.request

port = 3210

def fetch(url: str) -> str:
    with urllib.request.urlopen(url) as response:
        return response.read().decode()

for _ in range(40):
    try:
        health = json.loads(fetch(f"http://127.0.0.1:{port}/api/health"))
        if health.get("status") == "ok":
            break
    except Exception:
        time.sleep(0.25)
else:
    raise SystemExit("dashboard health check failed")

html = fetch(f"http://127.0.0.1:{port}/backtests/soxl")
required_markers = [
    "실행 모델 리스크 비교",
    "비용 민감도",
    "리스크 경고",
    "투자 조언 아님",
]
for marker in required_markers:
    if marker not in html:
        raise SystemExit(f"missing risk UI marker: {marker}")

risk = json.loads(fetch(f"http://127.0.0.1:{port}/api/backtests/risk?profileId=soxl_default_5x30"))
if len(risk.get("model_comparison", [])) != 3:
    raise SystemExit("risk model comparison size mismatch")
if len(risk.get("cost_sensitivity", [])) != 3:
    raise SystemExit("risk cost sensitivity size mismatch")
if not risk.get("warnings"):
    raise SystemExit("risk warnings missing")
if "ideal_to_next_open_return_drag_pct" not in risk.get("summary", {}):
    raise SystemExit("risk summary missing close-open drift")

print("risk e2e smoke passed")
PY
