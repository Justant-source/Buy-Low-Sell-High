#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3211}"
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
PORT="${PORT}" node dashboard/dist/server.js >/tmp/soxl-mania-backtest-e2e.log 2>&1 &
SERVER_PID="$!"

python3 - <<'PY'
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

port = 3211
root = Path.cwd()
csv_path = str((root / "engine/tests/fixtures/sample_soxl.csv").resolve())

def get(url: str):
    with urllib.request.urlopen(url) as response:
        return response.read().decode()

def post(url: str, payload: dict):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        return response.read().decode()

for _ in range(40):
    try:
        health = json.loads(get(f"http://127.0.0.1:{port}/api/health"))
        if health.get("status") == "ok":
            break
    except Exception:
        time.sleep(0.25)
else:
    raise SystemExit("dashboard health check failed")

html = get(f"http://127.0.0.1:{port}/backtests")
required_markers = [
    "백테스트 워크벤치",
    "9조합 비교 매트릭스",
    "실행 모델 리스크 비교",
    "리스크 경고",
]
for marker in required_markers:
    if marker not in html:
        raise SystemExit(f"missing backtest UI marker: {marker}")

job = json.loads(
    post(
        f"http://127.0.0.1:{port}/api/backtests/jobs",
        {
            "profileId": "mentor_default_5x30",
            "csvPath": csv_path,
            "initialCapital": 10000,
        },
    )
)
job_id = job["jobId"]

for _ in range(60):
    payload = json.loads(get(f"http://127.0.0.1:{port}/api/backtests/jobs/{job_id}"))
    if payload["status"] == "COMPLETED":
        run_id = payload["runId"]
        break
    if payload["status"] == "FAILED":
        raise SystemExit(f"backtest job failed: {payload.get('error')}")
    time.sleep(0.25)
else:
    raise SystemExit("backtest job did not complete")

run = json.loads(get(f"http://127.0.0.1:{port}/api/backtests/runs/{run_id}"))
if "metrics" not in run.get("payload", {}):
    raise SystemExit("run payload missing metrics")

compare = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/compare?profileId=mentor_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}&threads=5,6,7&stops=10,30,40"
    )
)
if len(compare.get("cells", [])) != 9:
    raise SystemExit("compare matrix did not return 9 cells")

risk = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/risk?profileId=mentor_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}"
    )
)
if len(risk.get("model_comparison", [])) != 3:
    raise SystemExit("risk comparison size mismatch")

csv_export = get(f"http://127.0.0.1:{port}/api/backtests/runs/{run_id}/trades.csv")
if "thread_id,signal_date" not in csv_export:
    raise SystemExit("trade export header missing")

print("backtest e2e smoke passed")
PY
