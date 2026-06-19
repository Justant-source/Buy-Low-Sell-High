#!/usr/bin/env bash
set -euo pipefail

./scripts/check_docker_access.sh

docker compose build
docker compose up -d postgres dashboard
