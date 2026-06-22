from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from datetime import date
import json
from pathlib import Path
import sys
from threading import Lock, Timer
from time import monotonic
from typing import Any

from ..config import load_strategy_mapping
from ..data.normalize import normalize_bars
from ..data.providers.csv_provider import CsvMarketDataProvider
from ..data.quality import compute_data_hash
from ..domain.models import MarketBar, StrategyConfig
from .strategy_explorer import build_slice_strategy_rankings, filter_bars_to_slice


def _normalized_overrides(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw:
        return {}
    mapping = {
        "threadCount": "thread_count",
        "stopSessions": "stop_sessions",
        "takeProfitPct": "take_profit_pct",
        "takeProfitOperator": "take_profit_operator",
        "entryDropPct": "entry_drop_pct",
        "stopLossPct": "stop_loss_pct",
        "maxEntriesPerSession": "max_entries_per_session",
        "sizingMode": "sizing_mode",
        "priceBasis": "price_basis",
        "regimeEnabled": "regime_enabled",
        "regimeSymbol": "regime_symbol",
        "regimeRsiPeriodWeeks": "regime_rsi_period_weeks",
        "regimeBearHighThreshold": "regime_bear_high_threshold",
        "regimeBearMidLowThreshold": "regime_bear_mid_low_threshold",
        "regimeBearMidHighThreshold": "regime_bear_mid_high_threshold",
        "regimeBullLowThreshold": "regime_bull_low_threshold",
        "regimeBullMidLowThreshold": "regime_bull_mid_low_threshold",
        "regimeBullMidHighThreshold": "regime_bull_mid_high_threshold",
        "regimeBaseStopSessions": "regime_base_stop_sessions",
        "regimeBaseBuyPct": "regime_base_buy_pct",
        "regimeBaseSellPct": "regime_base_sell_pct",
        "regimeBullStopSessions": "regime_bull_stop_sessions",
        "regimeBullBuyPct": "regime_bull_buy_pct",
        "regimeBullSellPct": "regime_bull_sell_pct",
        "regimeBearStopSessions": "regime_bear_stop_sessions",
        "regimeBearBuyPct": "regime_bear_buy_pct",
        "regimeBearSellPct": "regime_bear_sell_pct",
    }
    return {
        mapping.get(key, key): value
        for key, value in raw.items()
        if value is not None
    }


class StrategyRankingPoolDaemon:
    def __init__(self, *, max_workers: int, idle_timeout_seconds: int) -> None:
        self.max_workers = max(1, int(max_workers))
        self.idle_timeout_seconds = max(1, int(idle_timeout_seconds))
        self._bars_cache: dict[tuple[str, str, int, int], tuple[list[MarketBar], str]] = {}
        self._executor: ProcessPoolExecutor | None = None
        self._idle_timer: Timer | None = None
        self._lock = Lock()
        self._active_requests = 0
        self._last_activity = monotonic()

    def serve(self) -> int:
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                request_id = str(request.get("request_id", "unknown"))
                payload = self._handle_strategy_ranking_request(request["payload"])
                response = {
                    "request_id": request_id,
                    "ok": True,
                    "payload": payload,
                }
            except Exception as error:  # noqa: BLE001
                response = {
                    "request_id": str(request.get("request_id", "unknown")) if "request" in locals() else "unknown",
                    "ok": False,
                    "error": error.__class__.__name__,
                    "detail": str(error),
                }
            sys.stdout.write(json.dumps(response, default=str) + "\n")
            sys.stdout.flush()
        self._shutdown_executor()
        return 0

    def _handle_strategy_ranking_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._active_requests += 1
            self._cancel_idle_timer()
            executor = self._ensure_executor_locked()

        try:
            profile_path = str(payload["profile_path"])
            initial_capital = float(payload["initial_capital"])
            config_mapping = load_strategy_mapping(profile_path, initial_capital=initial_capital)
            config_mapping.update(_normalized_overrides(payload.get("overrides")))
            config = StrategyConfig.from_mapping(config_mapping)
            symbol = str(payload.get("symbol") or config.symbol)
            csv_path = str(payload["csv_path"])
            bars, data_hash = self._load_bars(csv_path, symbol)
            sliced_bars = filter_bars_to_slice(
                bars,
                slice_start=date.fromisoformat(payload["slice_start"]) if payload.get("slice_start") else None,
                slice_end=date.fromisoformat(payload["slice_end"]) if payload.get("slice_end") else None,
            )
            return build_slice_strategy_rankings(
                sliced_bars,
                config,
                data_hash=data_hash,
                execution_model=str(payload["execution_model"]),
                price_basis=str(payload["price_basis"]),
                limit=int(payload["limit"]),
                max_workers=self.max_workers,
                executor=executor,
            )
        finally:
            with self._lock:
                self._active_requests -= 1
                self._last_activity = monotonic()
                if self._active_requests == 0:
                    self._schedule_idle_timer_locked()

    def _load_bars(self, csv_path: str, symbol: str) -> tuple[list[MarketBar], str]:
        resolved_path = Path(csv_path).resolve()
        stat = resolved_path.stat()
        cache_key = (str(resolved_path), symbol, stat.st_mtime_ns, stat.st_size)
        cached = self._bars_cache.get(cache_key)
        if cached is not None:
            return cached
        bars = normalize_bars(CsvMarketDataProvider(csv_path).load_bars(symbol))
        payload = (bars, compute_data_hash(bars))
        self._bars_cache = {
            key: value
            for key, value in self._bars_cache.items()
            if key[0] != str(resolved_path) or key[1] != symbol
        }
        self._bars_cache[cache_key] = payload
        return payload

    def _ensure_executor_locked(self) -> ProcessPoolExecutor:
        if self._executor is None:
            self._executor = ProcessPoolExecutor(max_workers=self.max_workers)
        return self._executor

    def _schedule_idle_timer_locked(self) -> None:
        self._cancel_idle_timer()
        timer = Timer(self.idle_timeout_seconds, self._maybe_shutdown_executor)
        timer.daemon = True
        self._idle_timer = timer
        timer.start()

    def _cancel_idle_timer(self) -> None:
        if self._idle_timer is not None:
            self._idle_timer.cancel()
            self._idle_timer = None

    def _maybe_shutdown_executor(self) -> None:
        with self._lock:
            if self._active_requests > 0:
                return
            if monotonic() - self._last_activity < self.idle_timeout_seconds:
                self._schedule_idle_timer_locked()
                return
            executor = self._executor
            self._executor = None
            self._idle_timer = None
        if executor is not None:
            executor.shutdown(wait=False, cancel_futures=False)

    def _shutdown_executor(self) -> None:
        with self._lock:
            self._cancel_idle_timer()
            executor = self._executor
            self._executor = None
        if executor is not None:
            executor.shutdown(wait=False, cancel_futures=False)


def run_strategy_ranking_pool_daemon(*, max_workers: int, idle_timeout_seconds: int) -> int:
    daemon = StrategyRankingPoolDaemon(
        max_workers=max_workers,
        idle_timeout_seconds=idle_timeout_seconds,
    )
    return daemon.serve()
