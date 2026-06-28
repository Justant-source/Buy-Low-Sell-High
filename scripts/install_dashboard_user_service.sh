#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_NAME="buy-low-sell-high-dashboard.service"
SOURCE_UNIT="${ROOT_DIR}/ops/systemd/${UNIT_NAME}"
WATCHDOG_SERVICE_NAME="buy-low-sell-high-dashboard-watchdog.service"
WATCHDOG_TIMER_NAME="buy-low-sell-high-dashboard-watchdog.timer"
MARKET_REFRESH_SERVICE_TEMPLATE="buy-low-sell-high-market-refresh@.service"
MARKET_REFRESH_TIMERS=(
  "buy-low-sell-high-market-refresh-kr.timer"
  "buy-low-sell-high-market-refresh-us.timer"
)
TARGET_DIR="${HOME}/.config/systemd/user"
TARGET_UNIT="${TARGET_DIR}/${UNIT_NAME}"
TARGET_WATCHDOG_SERVICE="${TARGET_DIR}/${WATCHDOG_SERVICE_NAME}"
TARGET_WATCHDOG_TIMER="${TARGET_DIR}/${WATCHDOG_TIMER_NAME}"

mkdir -p "${TARGET_DIR}"
cp "${SOURCE_UNIT}" "${TARGET_UNIT}"
cp "${ROOT_DIR}/ops/systemd/${WATCHDOG_SERVICE_NAME}" "${TARGET_WATCHDOG_SERVICE}"
cp "${ROOT_DIR}/ops/systemd/${WATCHDOG_TIMER_NAME}" "${TARGET_WATCHDOG_TIMER}"
cp "${ROOT_DIR}/ops/systemd/${MARKET_REFRESH_SERVICE_TEMPLATE}" "${TARGET_DIR}/${MARKET_REFRESH_SERVICE_TEMPLATE}"
for timer_name in "${MARKET_REFRESH_TIMERS[@]}"; do
  cp "${ROOT_DIR}/ops/systemd/${timer_name}" "${TARGET_DIR}/${timer_name}"
done

systemctl --user daemon-reload
systemctl --user enable "${UNIT_NAME}"
systemctl --user enable "${WATCHDOG_TIMER_NAME}"
for timer_name in "${MARKET_REFRESH_TIMERS[@]}"; do
  systemctl --user enable "${timer_name}"
done
systemctl --user restart "${UNIT_NAME}"
systemctl --user restart "${WATCHDOG_TIMER_NAME}"
for timer_name in "${MARKET_REFRESH_TIMERS[@]}"; do
  systemctl --user restart "${timer_name}"
done

systemctl --user --no-pager --full status "${UNIT_NAME}" || true
systemctl --user --no-pager --full status "${WATCHDOG_TIMER_NAME}" || true
for timer_name in "${MARKET_REFRESH_TIMERS[@]}"; do
  systemctl --user --no-pager --full status "${timer_name}" || true
done
