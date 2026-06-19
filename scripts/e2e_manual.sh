#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3212}"
PROFILE_ID="mentor_low_vol_7x10"
LEDGER_PATH="${ROOT_DIR}/data/runtime/dashboard/manual-ledger-${PROFILE_ID}.json"
BACKUP_PATH=""
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKUP_PATH}" && -f "${BACKUP_PATH}" ]]; then
    mv "${BACKUP_PATH}" "${LEDGER_PATH}"
  else
    rm -f "${LEDGER_PATH}"
  fi
}
trap cleanup EXIT

cd "${ROOT_DIR}"

mkdir -p "$(dirname "${LEDGER_PATH}")"
if [[ -f "${LEDGER_PATH}" ]]; then
  BACKUP_PATH="$(mktemp "${LEDGER_PATH}.bak.XXXXXX")"
  cp "${LEDGER_PATH}" "${BACKUP_PATH}"
fi
rm -f "${LEDGER_PATH}"

npm --prefix dashboard run build >/dev/null
PORT="${PORT}" node dashboard/dist/server.js >/tmp/soxl-mania-manual-e2e.log 2>&1 &
SERVER_PID="$!"

python3 - <<'PY'
import json
import time
import urllib.request

port = 3212
profile_id = "mentor_low_vol_7x10"

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

html = get(f"http://127.0.0.1:{port}/manual")
required_markers = [
    "수동 장부 & 오늘의 권고",
    "권고 대비 실제 체결",
    "장부 상태 / 백업",
]
for marker in required_markers:
    if marker not in html:
        raise SystemExit(f"missing manual UI marker: {marker}")

threads = json.loads(get(f"http://127.0.0.1:{port}/api/manual/threads?profileId={profile_id}"))
if len(threads.get("threads", [])) != 7:
    raise SystemExit("manual threads were not initialized")

fill_response = json.loads(
    post(
        f"http://127.0.0.1:{port}/api/manual/fills",
        {
            "profileId": profile_id,
            "threadId": 1,
            "side": "BUY",
            "quantity": "10",
            "price": "25.10",
            "fee": "0",
            "filledAt": "2026-06-19T00:00:00+09:00",
        },
    )
)
fill_id = fill_response["fill"]["fill_id"]

history = json.loads(get(f"http://127.0.0.1:{port}/api/manual/history?profileId={profile_id}"))
if len(history.get("fills", [])) != 1:
    raise SystemExit("manual history missing appended fill")

comparison = json.loads(get(f"http://127.0.0.1:{port}/api/manual/comparison?profileId={profile_id}"))
if "rows" not in comparison:
    raise SystemExit("manual comparison missing rows")

reverse = json.loads(post(f"http://127.0.0.1:{port}/api/manual/fills/{fill_id}/reverse", {"profileId": profile_id}))
if "fill" not in reverse:
    raise SystemExit("reverse response missing fill")

history_after = json.loads(get(f"http://127.0.0.1:{port}/api/manual/history?profileId={profile_id}"))
if len(history_after.get("fills", [])) != 2:
    raise SystemExit("manual reverse did not append reversal fill")
if history_after["fills"][0]["reversed_by_fill_id"] is None:
    raise SystemExit("original fill was not marked reversed")

reconcile = json.loads(post(f"http://127.0.0.1:{port}/api/manual/reconcile", {"profileId": profile_id}))
if "issues" not in reconcile:
    raise SystemExit("reconcile response missing issues")

export_payload = get(f"http://127.0.0.1:{port}/api/manual/export?profileId={profile_id}&format=json")
if '"account_id": "mentor_low_vol_7x10"' not in export_payload:
    raise SystemExit("manual export missing account id")

print("manual e2e smoke passed")
PY
