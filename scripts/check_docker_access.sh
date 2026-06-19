#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  echo "docker CLI is installed but daemon access is unavailable"
  echo "This environment cannot connect to /var/run/docker.sock. Check snap confinement or socket permissions."
  exit 1
fi
