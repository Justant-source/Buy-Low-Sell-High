#!/usr/bin/env bash
set -euo pipefail

if [[ "${BLSH_CLEANUP_ALL_DAEMONS:-false}" != "true" ]]; then
  exit 0
fi

pkill -f '/home/justant/Data/Buy-Low-Sell-High/.*/buy_low_sell_high.cli worker strategy-ranking-daemon' 2>/dev/null || true
pkill -f 'buy_low_sell_high.cli worker strategy-ranking-daemon' 2>/dev/null || true
