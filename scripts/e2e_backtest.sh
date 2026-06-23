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
expected_workspace_ids = {"tqqq", "koru", "0193t0", "233740", "462330"}
missing_workspace_ids = expected_workspace_ids - workspace_ids
if missing_workspace_ids:
    raise SystemExit(f"workspace list missing: {sorted(missing_workspace_ids)}")
workspace_order = [row["workspaceId"] for row in workspaces.get("workspaces", [])]
if "soxl" not in workspace_order or "tqqq" not in workspace_order or "koru" not in workspace_order:
    raise SystemExit("workspace order missing soxl, tqqq, or koru")
if workspace_order.index("tqqq") != workspace_order.index("soxl") + 1:
    raise SystemExit("tqqq workspace is not directly below soxl")
if workspace_order.index("koru") != workspace_order.index("tqqq") + 1:
    raise SystemExit("koru workspace is not directly below tqqq")

def assert_profile_bundle(workspace_id: str, default_profile_id: str, expected_profile_ids: set[str]):
    payload = json.loads(get(f"http://127.0.0.1:{port}/api/profiles?workspaceId={workspace_id}"))
    if payload.get("defaultProfileId") != default_profile_id:
        raise SystemExit(f"{workspace_id} default profile mismatch")
    actual_profile_ids = {row["profileId"] for row in payload.get("profiles", [])}
    if actual_profile_ids != expected_profile_ids:
        raise SystemExit(f"{workspace_id} profile set mismatch: {sorted(actual_profile_ids)}")

workspace_0193t0 = next(row for row in workspaces["workspaces"] if row["workspaceId"] == "0193t0")
if workspace_0193t0.get("referenceMode") != "backtest_only":
    raise SystemExit("0193t0 workspace referenceMode mismatch")
assert_profile_bundle(
    "0193t0",
    "0193t0_default_5x30",
    {"0193t0_default_5x30", "0193t0_default_7x30", "0193t0_best_avg_5x40"},
)
data_0193t0 = json.loads(get(f"http://127.0.0.1:{port}/api/data/status?workspaceId=0193t0"))
if data_0193t0.get("symbol") != "0193T0":
    raise SystemExit("0193t0 data status symbol mismatch")
if not any("Synthetic pre-listing history present" in warning for warning in data_0193t0.get("warnings", [])):
    raise SystemExit("0193t0 data status missing synthetic warning")

workspace_tqqq = next(row for row in workspaces["workspaces"] if row["workspaceId"] == "tqqq")
if workspace_tqqq.get("referenceMode") != "official_reference":
    raise SystemExit("tqqq workspace referenceMode mismatch")
assert_profile_bundle(
    "tqqq",
    "tqqq_official_ddeolsao_pal_v1",
    {
        "tqqq_official_ddeolsao_pal_v1",
        "tqqq_default_5x30",
        "tqqq_default_7x30",
        "tqqq_best_avg_5x40",
    },
)
data_tqqq = json.loads(get(f"http://127.0.0.1:{port}/api/data/status?workspaceId=tqqq"))
if data_tqqq.get("symbol") != "TQQQ":
    raise SystemExit("tqqq data status symbol mismatch")
if data_tqqq.get("source") != "yahoo_chart":
    raise SystemExit("tqqq data status source mismatch")
if any("Synthetic pre-listing history present" in warning for warning in data_tqqq.get("warnings", [])):
    raise SystemExit("tqqq data status should not contain synthetic warning")

workspace_koru = next(row for row in workspaces["workspaces"] if row["workspaceId"] == "koru")
if workspace_koru.get("referenceMode") != "official_reference":
    raise SystemExit("koru workspace referenceMode mismatch")
assert_profile_bundle(
    "koru",
    "koru_official_ddeolsao_pal_v1",
    {
        "koru_official_ddeolsao_pal_v1",
        "koru_default_5x30",
        "koru_default_7x30",
        "koru_best_avg_5x40",
    },
)
data_koru = json.loads(get(f"http://127.0.0.1:{port}/api/data/status?workspaceId=koru"))
if data_koru.get("symbol") != "KORU":
    raise SystemExit("koru data status symbol mismatch")
if data_koru.get("source") != "yahoo_chart":
    raise SystemExit("koru data status source mismatch")
if any("Synthetic pre-listing history present" in warning for warning in data_koru.get("warnings", [])):
    raise SystemExit("koru data status should not contain synthetic warning")

for workspace_id, symbol, default_profile_id in [
    ("233740", "233740", "233740_default_5x30"),
    ("462330", "462330", "462330_default_5x30"),
]:
    html = get(f"http://127.0.0.1:{port}/backtests/{workspace_id}")
    if "Buy-Low-Sell-High" not in html:
        raise SystemExit(f"{workspace_id} backtest page missing app shell")
    workspace = next(row for row in workspaces["workspaces"] if row["workspaceId"] == workspace_id)
    if workspace.get("referenceMode") != "backtest_only":
        raise SystemExit(f"{workspace_id} workspace referenceMode mismatch")
    assert_profile_bundle(
        workspace_id,
        default_profile_id,
        {
            f"{workspace_id}_default_5x30",
            f"{workspace_id}_default_7x30",
            f"{workspace_id}_best_avg_5x40",
        },
    )
    data_status = json.loads(get(f"http://127.0.0.1:{port}/api/data/status?workspaceId={workspace_id}"))
    if data_status.get("symbol") != symbol:
        raise SystemExit(f"{workspace_id} data status symbol mismatch")
    if data_status.get("source") != "naver":
        raise SystemExit(f"{workspace_id} data status source mismatch")
    if any("Synthetic pre-listing history present" in warning for warning in data_status.get("warnings", [])):
        raise SystemExit(f"{workspace_id} data status should not contain synthetic warning")

strategy_explorer = json.loads(
    get(
        f"http://127.0.0.1:{port}/api/backtests/strategy-explorer?profileId=soxl_default_5x30"
        f"&csvPath={urllib.parse.quote(csv_path, safe='')}&executionModel=next_open&priceBasis=adjusted_close"
    )
)
if strategy_explorer.get("meta", {}).get("catalog_id") != "core_profiles_v2":
    raise SystemExit("strategy explorer did not return the expected catalog_id")
if len(strategy_explorer.get("strategies", [])) != 6:
    raise SystemExit("strategy explorer did not return the 6 preset strategies")
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
if sweep_payload.get("meta", {}).get("sweep_id") != "core4_v4":
    raise SystemExit("sweep payload missing core4_v4 metadata")
if sweep_payload.get("meta", {}).get("combo_count") != 726:
    raise SystemExit("sweep payload combo count mismatch")
if len(sweep_payload.get("rows", [])) != 726:
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
