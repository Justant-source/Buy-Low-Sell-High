#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="${BUY_LOW_SELL_HIGH_NODE_VERSION:-v20.19.5}"
NODE_PLATFORM="linux-x64"
NODE_DIR="${ROOT_DIR}/.tools/node-${NODE_VERSION}-${NODE_PLATFORM}"
NODE_BIN="${NODE_DIR}/bin/node"
NPM_BIN="${NODE_DIR}/bin/npm"

have_system_toolchain() {
  command -v node >/dev/null 2>&1 &&
    command -v npm >/dev/null 2>&1 &&
    node -v >/dev/null 2>&1 &&
    npm -v >/dev/null 2>&1
}

ensure_local_toolchain() {
  if [[ -x "${NODE_BIN}" && -x "${NPM_BIN}" ]]; then
    return
  fi

  mkdir -p "${ROOT_DIR}/.tools"
  ROOT_DIR="${ROOT_DIR}" NODE_VERSION="${NODE_VERSION}" NODE_PLATFORM="${NODE_PLATFORM}" python3 - <<'PY'
from __future__ import annotations

import os
from pathlib import Path
import tarfile
import urllib.request

root_dir = Path(os.environ["ROOT_DIR"])
node_version = os.environ["NODE_VERSION"]
node_platform = os.environ["NODE_PLATFORM"]
archive_name = f"node-{node_version}-{node_platform}.tar.xz"
archive_url = f"https://nodejs.org/dist/{node_version}/{archive_name}"
tools_dir = root_dir / ".tools"
archive_path = tools_dir / archive_name
install_dir = tools_dir / f"node-{node_version}-{node_platform}"

if install_dir.exists():
    raise SystemExit(0)

with urllib.request.urlopen(archive_url, timeout=60) as response:
    archive_path.write_bytes(response.read())

with tarfile.open(archive_path, "r:xz") as archive:
    archive.extractall(tools_dir)
PY
}

activate_toolchain() {
  if have_system_toolchain; then
    return
  fi
  ensure_local_toolchain
  export PATH="${NODE_DIR}/bin:${PATH}"
}

dashboard_npm() {
  npm --prefix "${ROOT_DIR}/dashboard" --script-shell /bin/bash "$@"
}

ensure_dashboard_dist() {
  if [[ -f "${ROOT_DIR}/dashboard/dist/server.js" ]]; then
    return
  fi
  echo "dashboard dist missing; running build first" >&2
  dashboard_npm run build
}

activate_toolchain

if [[ -z "${DATABASE_URL:-}" && -z "${SQLITE_PATH:-}" ]]; then
  export SQLITE_PATH="${ROOT_DIR}/data/runtime/buy-low-sell-high.sqlite"
fi

subcommand="${1:-}"
if [[ -z "${subcommand}" ]]; then
  echo "usage: $0 <build|test|start|npm|node> [args...]" >&2
  exit 1
fi

shift

case "${subcommand}" in
  build)
    dashboard_npm run build
    ;;
  test)
    dashboard_npm test
    ;;
  start)
    ensure_dashboard_dist
    exec node "${ROOT_DIR}/dashboard/dist/server.js" "$@"
    ;;
  npm)
    dashboard_npm "$@"
    ;;
  node)
    exec node "$@"
    ;;
  *)
    echo "unknown subcommand: ${subcommand}" >&2
    exit 1
    ;;
esac
