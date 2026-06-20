from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from hashlib import sha256
import json
from typing import Any
from uuid import uuid4

from .enums import (
    CloseReason,
    EndOfTestMode,
    EventOrder,
    ExecutionModel,
    PriceBasis,
    RecommendationAction,
    SizingMode,
    ThreadSelector,
    ThreadState,
    YearBoundary,
)
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
    commission_bps: Decimal = ZERO
    slippage_bps: Decimal = ZERO
    profile_id: str = "custom"

    @classmethod
    def from_mapping(cls, mapping: dict[str, Any]) -> "StrategyConfig":
        payload = dict(mapping)
        payload["thread_count"] = int(payload.get("thread_count", 7))
        payload["stop_sessions"] = int(payload.get("stop_sessions", 30))
        payload["max_entries_per_session"] = int(payload.get("max_entries_per_session", 1))
        payload["take_profit_pct"] = D(payload.get("take_profit_pct", 0))
        payload["entry_drop_pct"] = D(payload.get("entry_drop_pct", 0))
        payload["stop_loss_pct"] = D(payload.get("stop_loss_pct", 0))
        payload["initial_capital"] = D(payload.get("initial_capital", "10000"))
        payload["commission_bps"] = D(payload.get("commission_bps", 0))
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
                "slippage_bps": str(self.slippage_bps),
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
    exit_signal_date: date | None = None
    fill_exit_date: date | None = None
    exit_price: Decimal | None = None
    holding_sessions: int | None = None
    pnl: Decimal = ZERO
    return_pct: Decimal = ZERO
    close_reason: CloseReason | None = None


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
    code_commit: str = "workspace"


@dataclass(frozen=True)
class Recommendation:
    thread_id: int
    action: RecommendationAction
    reason: str
    basis_price: Decimal
    session_date: date


@dataclass
class ManualFill:
    fill_id: str
    thread_id: int
    side: str
    quantity: Decimal
    price: Decimal
    fee: Decimal
    filled_at: datetime
    reversed_by_fill_id: str | None = None


@dataclass
class ManualThreadState:
    thread_id: int
    cash: Decimal
    quantity: Decimal = ZERO
    entry_price: Decimal = ZERO
    entry_date: date | None = None


@dataclass
class ManualLedger:
    account_id: str
    threads: dict[int, ManualThreadState]
    fills: list[ManualFill] = field(default_factory=list)


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


def new_fill_id() -> str:
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
