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

./scripts/dashboard_exec.sh build >/dev/null
PORT="${PORT}" ./scripts/dashboard_exec.sh start >/tmp/buy-low-sell-high-backtest-e2e.log 2>&1 &
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

html = get(f"http://127.0.0.1:{port}/backtests/soxl")
required_markers = [
    "Buy-Low-Sell-High",
    "전략",
    "파라미터 테스트",
    "멘토 래퍼런스",
    "콤보 랭킹",
    "Thread Timeline",
    "Thread Drilldown",
    "Parameter Sweep Explorer",
    "멘토 원본 자료",
]
for marker in required_markers:
    if marker not in html:
        raise SystemExit(f"missing backtest UI marker: {marker}")

workspaces = json.loads(get(f"http://127.0.0.1:{port}/api/workspaces"))
workspace_ids = {row["workspaceId"] for row in workspaces.get("workspaces", [])}
if "0193t0" not in workspace_ids:
    raise SystemExit("workspace list missing 0193t0")

workspace_0193t0 = next(row for row in workspaces["workspaces"] if row["workspaceId"] == "0193t0")
if workspace_0193t0.get("referenceMode") != "backtest_only":
    raise SystemExit("0193t0 workspace referenceMode mismatch")

profiles_0193t0 = json.loads(
    get(f"http://127.0.0.1:{port}/api/profiles?workspaceId=0193t0")
)
if profiles_0193t0.get("defaultProfileId") != "0193t0_default_5x30":
    raise SystemExit("0193t0 default profile mismatch")
if len(profiles_0193t0.get("profiles", [])) != 4:
    raise SystemExit("0193t0 profile count mismatch")

data_0193t0 = json.loads(get(f"http://127.0.0.1:{port}/api/data/status?workspaceId=0193t0"))
if data_0193t0.get("symbol") != "0193T0":
    raise SystemExit("0193t0 data status symbol mismatch")
if not any("Synthetic pre-listing history present" in warning for warning in data_0193t0.get("warnings", [])):
    raise SystemExit("0193t0 data status missing synthetic warning")

strategy_explorer = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/strategy-explorer?profileId=soxl_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}&executionModel=next_open&priceBasis=adjusted_close"
    )
)
if strategy_explorer.get("meta", {}).get("catalog_id") != "core_profiles_v1":
    raise SystemExit("strategy explorer did not return the expected catalog_id")
if len(strategy_explorer.get("strategies", [])) != 9:
    raise SystemExit("strategy explorer did not return the 9 preset strategies")
if not strategy_explorer["strategies"][0].get("segments"):
    raise SystemExit("strategy explorer payload missing segment summaries")
if not strategy_explorer["strategies"][0].get("daily"):
    raise SystemExit("strategy explorer payload missing daily series")

job = json.loads(
    post(
        f"http://127.0.0.1:{port}/api/backtests/jobs",
        {
            "profileId": "soxl_default_5x30",
            "csvPath": csv_path,
            "initialCapital": 10000,
            "overrides": {
                "threadCount": 7,
                "stopSessions": 30,
                "takeProfitPct": 5,
                "entryDropPct": 0,
                "stopLossPct": 0,
                "maxEntriesPerSession": 1,
                "sizingMode": "fixed_principal",
                "priceBasis": "adjusted_close",
            },
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
if str(run["payload"]["config"].get("thread_count")) != "7":
    raise SystemExit("run payload did not apply thread_count override")
if str(run["payload"]["config"].get("take_profit_pct")) != "5":
    raise SystemExit("run payload did not apply take_profit_pct override")

compare = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/compare?profileId=soxl_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}&threads=6,7&stops=10,30"
        f"&takeProfitPct=5&threadCount=7&stopSessions=30"
    )
)
if len(compare.get("cells", [])) != 4:
    raise SystemExit("compare matrix did not return the requested cell count")

risk = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/risk?profileId=soxl_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}&takeProfitPct=5&threadCount=7&stopSessions=30"
    )
)
if len(risk.get("model_comparison", [])) != 3:
    raise SystemExit("risk comparison size mismatch")

csv_export = get(f"http://127.0.0.1:{port}/api/backtests/runs/{run_id}/trades.csv")
if "thread_id,signal_date" not in csv_export:
    raise SystemExit("trade export header missing")

sweep_job = json.loads(
    post(
        f"http://127.0.0.1:{port}/api/backtests/sweeps/jobs",
        {
            "profileId": "soxl_default_5x30",
            "csvPath": csv_path,
            "initialCapital": 10000,
            "executionModel": "next_open",
            "priceBasis": "adjusted_close",
        },
    )
)
sweep_job_id = sweep_job["jobId"]

artifact_id = sweep_job.get("artifactId")
if sweep_job["status"] != "COMPLETED":
    for _ in range(240):
        payload = json.loads(get(f"http://127.0.0.1:{port}/api/backtests/sweeps/jobs/{sweep_job_id}"))
        if payload["status"] == "COMPLETED":
            artifact_id = payload["artifactId"]
            break
        if payload["status"] == "FAILED":
            raise SystemExit(f"sweep job failed: {payload.get('error')}")
        time.sleep(0.25)
    else:
        raise SystemExit("sweep job did not complete")

if not artifact_id:
    raise SystemExit("sweep job did not produce an artifact_id")

sweep_artifact = json.loads(get(f"http://127.0.0.1:{port}/api/backtests/sweeps/runs/{artifact_id}"))
sweep_payload = sweep_artifact.get("payload", {})
if sweep_artifact.get("kind") != "PARAMETER_SWEEP":
    raise SystemExit("sweep artifact kind mismatch")
if sweep_payload.get("meta", {}).get("sweep_id") != "core6_v1":
    raise SystemExit("sweep payload missing core6_v1 metadata")
if sweep_payload.get("meta", {}).get("combo_count") != 648:
    raise SystemExit("sweep payload combo count mismatch")
if len(sweep_payload.get("rows", [])) != 648:
    raise SystemExit("sweep payload rows mismatch")
if not sweep_payload.get("summary", {}).get("best_robust_combo"):
    raise SystemExit("sweep payload missing robust summary")

latest_sweep = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/sweeps/latest?profileId=soxl_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}&executionModel=next_open&priceBasis=adjusted_close"
    )
)
if latest_sweep is None or latest_sweep.get("artifactId") != artifact_id:
    raise SystemExit("latest sweep endpoint did not return the completed artifact")

print("backtest e2e smoke passed")
PY
