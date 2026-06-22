from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from hashlib import sha256
import json
from typing import Any
from uuid import uuid4

from ..code_version import current_code_commit
from ..symbols import get_symbol_definition
from .enums import CloseReason, EndOfTestMode, EventOrder, ExecutionModel, PriceBasis, SizingMode, ThreadSelector, ThreadState, YearBoundary
from .money import D, ZERO, quantize_money, quantize_shares


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class MarketBar:
    symbol: str
    session_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    adj_close: Decimal
    volume: int = 0
    dividend: Decimal = ZERO
    split_ratio: Decimal = D("1")
    source: str = "csv"

    def price_for_basis(self, basis: PriceBasis) -> Decimal:
        if basis == PriceBasis.ADJUSTED_CLOSE:
            return self.adj_close
        return self.close


@dataclass(frozen=True)
class DataImportReport:
    symbol: str
    source: str
    rows: int
    data_hash: str
    started_at: datetime
    missing_fields: int
    warnings: list[str]


DEFAULT_COMMISSION_BPS = D("25")


def default_transaction_tax_bps(symbol: object) -> Decimal:
    resolved_symbol = str(symbol or "SOXL").upper()
    definition = get_symbol_definition(resolved_symbol)
    return D(definition.transaction_tax_bps)


@dataclass
class StrategyConfig:
    symbol: str = "SOXL"
    thread_count: int = 7
    stop_sessions: int = 30
    entry_rule: str = "close_lt_previous_close"
    max_entries_per_session: int = 1
    take_profit_pct: Decimal = D("0")
    take_profit_operator: str = "gt"
    entry_drop_pct: Decimal = D("0")
    stop_loss_pct: Decimal = D("0")
    profit_precedes_stop: bool = True
    event_order: EventOrder = EventOrder.EXITS_THEN_ENTRY
    allow_same_session_thread_reuse: bool = True
    thread_selector: ThreadSelector = ThreadSelector.ROUND_ROBIN
    year_boundary: YearBoundary = YearBoundary.CARRY
    end_of_test: EndOfTestMode = EndOfTestMode.MARK_TO_MARKET
    sizing_mode: SizingMode = SizingMode.FIXED_PRINCIPAL
    price_basis: PriceBasis = PriceBasis.ADJUSTED_CLOSE
    execution_model: ExecutionModel = ExecutionModel.IDEAL_SAME_CLOSE
    initial_capital: Decimal = D("10000")
    allow_fractional_shares: bool = False
    commission_bps: Decimal = DEFAULT_COMMISSION_BPS
    transaction_tax_bps: Decimal = ZERO
    slippage_bps: Decimal = ZERO
    regime_enabled: bool = False
    regime_symbol: str = "QQQ"
    regime_rsi_period_weeks: int = 14
    regime_bear_high_threshold: Decimal = D("45")
    regime_bear_mid_low_threshold: Decimal = D("45")
    regime_bear_mid_high_threshold: Decimal = D("45")
    regime_bull_low_threshold: Decimal = D("55")
    regime_bull_mid_low_threshold: Decimal = D("55")
    regime_bull_mid_high_threshold: Decimal = D("55")
    regime_base_stop_sessions: int = 30
    regime_base_buy_pct: Decimal = D("0")
    regime_base_sell_pct: Decimal = D("0")
    regime_bull_stop_sessions: int = 30
    regime_bull_buy_pct: Decimal = D("0")
    regime_bull_sell_pct: Decimal = D("0")
    regime_bear_stop_sessions: int = 30
    regime_bear_buy_pct: Decimal = D("0")
    regime_bear_sell_pct: Decimal = D("0")
    regime_csv_path: str = ""
    profile_id: str = "custom"

    @classmethod
    def from_mapping(cls, mapping: dict[str, Any]) -> "StrategyConfig":
        payload = dict(mapping)
        payload["thread_count"] = int(payload.get("thread_count", 7))
        payload["stop_sessions"] = int(payload.get("stop_sessions", 30))
        payload["max_entries_per_session"] = int(payload.get("max_entries_per_session", 1))
        payload["regime_rsi_period_weeks"] = int(payload.get("regime_rsi_period_weeks", 14))
        payload["take_profit_pct"] = D(payload.get("take_profit_pct", 0))
        payload["entry_drop_pct"] = D(payload.get("entry_drop_pct", 0))
        payload["stop_loss_pct"] = D(payload.get("stop_loss_pct", 0))
        attack_threshold = D(
            payload.get(
                "regime_bull_mid_low_threshold",
                payload.get(
                    "regime_bull_low_threshold",
                    payload.get("regime_bull_mid_high_threshold", 55),
                ),
            )
        )
        defense_threshold = D(
            payload.get(
                "regime_bear_mid_high_threshold",
                payload.get(
                    "regime_bear_mid_low_threshold",
                    payload.get("regime_bear_high_threshold", 45),
                ),
            )
        )
        payload["regime_bear_high_threshold"] = defense_threshold
        payload["regime_bear_mid_low_threshold"] = defense_threshold
        payload["regime_bear_mid_high_threshold"] = defense_threshold
        payload["regime_bull_low_threshold"] = attack_threshold
        payload["regime_bull_mid_low_threshold"] = attack_threshold
        payload["regime_bull_mid_high_threshold"] = attack_threshold
        payload["regime_base_stop_sessions"] = int(payload.get("regime_base_stop_sessions", payload["stop_sessions"]))
        payload["regime_base_buy_pct"] = D(payload.get("regime_base_buy_pct", payload.get("entry_drop_pct", 0)))
        payload["regime_base_sell_pct"] = D(payload.get("regime_base_sell_pct", payload.get("take_profit_pct", 0)))
        payload["regime_bull_stop_sessions"] = int(payload.get("regime_bull_stop_sessions", payload["stop_sessions"]))
        payload["regime_bull_buy_pct"] = D(payload.get("regime_bull_buy_pct", payload.get("entry_drop_pct", 0)))
        payload["regime_bull_sell_pct"] = D(payload.get("regime_bull_sell_pct", payload.get("take_profit_pct", 0)))
        payload["regime_bear_stop_sessions"] = int(payload.get("regime_bear_stop_sessions", payload["stop_sessions"]))
        payload["regime_bear_buy_pct"] = D(payload.get("regime_bear_buy_pct", payload.get("entry_drop_pct", 0)))
        payload["regime_bear_sell_pct"] = D(payload.get("regime_bear_sell_pct", payload.get("take_profit_pct", 0)))
        payload["initial_capital"] = D(payload.get("initial_capital", "10000"))
        payload["commission_bps"] = D(payload.get("commission_bps", DEFAULT_COMMISSION_BPS))
        payload["transaction_tax_bps"] = D(
            payload.get("transaction_tax_bps", default_transaction_tax_bps(payload.get("symbol", "SOXL"))),
        )
        payload["slippage_bps"] = D(payload.get("slippage_bps", 0))
        payload["event_order"] = EventOrder(payload.get("event_order", EventOrder.EXITS_THEN_ENTRY))
        payload["thread_selector"] = ThreadSelector(payload.get("thread_selector", ThreadSelector.ROUND_ROBIN))
        payload["year_boundary"] = YearBoundary(payload.get("year_boundary", YearBoundary.CARRY))
        payload["end_of_test"] = EndOfTestMode(payload.get("end_of_test", EndOfTestMode.MARK_TO_MARKET))
        payload["sizing_mode"] = SizingMode(payload.get("sizing_mode", SizingMode.FIXED_PRINCIPAL))
        payload["price_basis"] = PriceBasis(payload.get("price_basis", PriceBasis.ADJUSTED_CLOSE))
        payload["execution_model"] = ExecutionModel(payload.get("execution_model", ExecutionModel.IDEAL_SAME_CLOSE))
        payload["allow_same_session_thread_reuse"] = bool(payload.get("allow_same_session_thread_reuse", True))
        payload["profit_precedes_stop"] = bool(payload.get("profit_precedes_stop", True))
        payload["allow_fractional_shares"] = bool(payload.get("allow_fractional_shares", False))
        payload["regime_enabled"] = bool(payload.get("regime_enabled", False))
        return cls(**payload)

    def config_hash(self) -> str:
        raw = json.dumps(
            {
                "symbol": self.symbol,
                "thread_count": self.thread_count,
                "stop_sessions": self.stop_sessions,
                "entry_rule": self.entry_rule,
                "max_entries_per_session": self.max_entries_per_session,
                "take_profit_pct": str(self.take_profit_pct),
                "take_profit_operator": self.take_profit_operator,
                "entry_drop_pct": str(self.entry_drop_pct),
                "stop_loss_pct": str(self.stop_loss_pct),
                "event_order": self.event_order.value,
                "allow_same_session_thread_reuse": self.allow_same_session_thread_reuse,
                "thread_selector": self.thread_selector.value,
                "year_boundary": self.year_boundary.value,
                "end_of_test": self.end_of_test.value,
                "sizing_mode": self.sizing_mode.value,
                "price_basis": self.price_basis.value,
                "execution_model": self.execution_model.value,
                "initial_capital": str(self.initial_capital),
                "allow_fractional_shares": self.allow_fractional_shares,
                "commission_bps": str(self.commission_bps),
                "transaction_tax_bps": str(self.transaction_tax_bps),
                "slippage_bps": str(self.slippage_bps),
                "regime": {
                    "enabled": self.regime_enabled,
                    "symbol": self.regime_symbol,
                    "rsi_period_weeks": self.regime_rsi_period_weeks,
                    "bear_high_threshold": str(self.regime_bear_high_threshold),
                    "bear_mid_low_threshold": str(self.regime_bear_mid_low_threshold),
                    "bear_mid_high_threshold": str(self.regime_bear_mid_high_threshold),
                    "bull_low_threshold": str(self.regime_bull_low_threshold),
                    "bull_mid_low_threshold": str(self.regime_bull_mid_low_threshold),
                    "bull_mid_high_threshold": str(self.regime_bull_mid_high_threshold),
                    "base_stop_sessions": self.regime_base_stop_sessions,
                    "base_buy_pct": str(self.regime_base_buy_pct),
                    "base_sell_pct": str(self.regime_base_sell_pct),
                    "bull_stop_sessions": self.regime_bull_stop_sessions,
                    "bull_buy_pct": str(self.regime_bull_buy_pct),
                    "bull_sell_pct": str(self.regime_bull_sell_pct),
                    "bear_stop_sessions": self.regime_bear_stop_sessions,
                    "bear_buy_pct": str(self.regime_bear_buy_pct),
                    "bear_sell_pct": str(self.regime_bear_sell_pct),
                },
            },
            sort_keys=True,
        )
        return sha256(raw.encode("utf-8")).hexdigest()

    def regime_config_hash(self) -> str:
        raw = json.dumps(
            {
                "enabled": self.regime_enabled,
                "symbol": self.regime_symbol,
                "rsi_period_weeks": self.regime_rsi_period_weeks,
                "bear_high_threshold": str(self.regime_bear_high_threshold),
                "bear_mid_low_threshold": str(self.regime_bear_mid_low_threshold),
                "bear_mid_high_threshold": str(self.regime_bear_mid_high_threshold),
                "bull_low_threshold": str(self.regime_bull_low_threshold),
                "bull_mid_low_threshold": str(self.regime_bull_mid_low_threshold),
                "bull_mid_high_threshold": str(self.regime_bull_mid_high_threshold),
                "base_stop_sessions": self.regime_base_stop_sessions,
                "base_buy_pct": str(self.regime_base_buy_pct),
                "base_sell_pct": str(self.regime_base_sell_pct),
                "bull_stop_sessions": self.regime_bull_stop_sessions,
                "bull_buy_pct": str(self.regime_bull_buy_pct),
                "bull_sell_pct": str(self.regime_bull_sell_pct),
                "bear_stop_sessions": self.regime_bear_stop_sessions,
                "bear_buy_pct": str(self.regime_bear_buy_pct),
                "bear_sell_pct": str(self.regime_bear_sell_pct),
            },
            sort_keys=True,
        )
        return sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class CapitalThread:
    thread_id: int
    state: ThreadState = ThreadState.FREE
    reserve_pnl: Decimal = ZERO
    free_equity: Decimal = ZERO
    entry_price: Decimal = ZERO
    shares: Decimal = ZERO
    entry_session_index: int | None = None
    entry_date: date | None = None
    invested_amount: Decimal = ZERO
    last_closed_session_index: int | None = None
    active_regime: str = "neutral"
    active_stop_sessions: int = 0
    active_take_profit_pct: Decimal = ZERO
    active_buy_pct: Decimal = ZERO

    def total_equity(self, mark_price: Decimal) -> Decimal:
        if self.state == ThreadState.OPEN:
            return self.reserve_pnl + (self.shares * mark_price)
        return self.free_equity


@dataclass(frozen=True)
class StrategyEvent:
    session_date: date
    session_index: int
    thread_id: int | None
    event_type: str
    price: Decimal | None = None
    reason: str | None = None
    detail: str | None = None


@dataclass
class Trade:
    run_id: str
    thread_id: int
    signal_date: date
    fill_entry_date: date
    entry_price: Decimal
    shares: Decimal
    invested_amount: Decimal
    entry_fee: Decimal = ZERO
    exit_signal_date: date | None = None
    fill_exit_date: date | None = None
    exit_price: Decimal | None = None
    exit_fee: Decimal = ZERO
    holding_sessions: int | None = None
    pnl: Decimal = ZERO
    return_pct: Decimal = ZERO
    close_reason: CloseReason | None = None
    entry_regime: str = "neutral"
    entry_stop_sessions: int = 0
    entry_buy_pct: Decimal = ZERO
    entry_sell_pct: Decimal = ZERO


@dataclass(frozen=True)
class DailySnapshot:
    session_date: date
    session_index: int
    total_equity: Decimal
    realized_pnl: Decimal
    drawdown: Decimal
    open_threads: int
    entries: int
    take_profits: int
    time_stops: int
    skipped_entries: int
    applied_regime: str = "neutral"


@dataclass
class BacktestRun:
    run_id: str
    config: StrategyConfig
    data_hash: str
    trades: list[Trade]
    events: list[StrategyEvent]
    daily: list[DailySnapshot]
    yearly: dict[int, dict[str, Any]]
    metrics: dict[str, Decimal | int | str]
    code_commit: str = field(default_factory=current_code_commit)
    regime_data_hash: str | None = None
    regime_config_hash: str | None = None


@dataclass
class BacktestJob:
    job_id: str
    config_hash: str
    data_hash: str
    status: str = "QUEUED"
    requested_at: datetime = field(default_factory=utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    cancel_requested: bool = False
    error_message: str | None = None
    progress: int = 0
    run_id: str | None = None
    owner: str | None = None


def new_run_id() -> str:
    return str(uuid4())


def compute_trade_pnl(trade: Trade) -> None:
    if trade.exit_price is None:
        trade.pnl = ZERO
        trade.return_pct = ZERO
        return
    proceeds = quantize_money(trade.shares * trade.exit_price)
    trade.pnl = quantize_money(proceeds - trade.invested_amount)
    if trade.invested_amount == ZERO:
        trade.return_pct = ZERO
    else:
        trade.return_pct = quantize_money((trade.pnl / trade.invested_amount) * D("100"))
