from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from decimal import Decimal

from ..backtest.execution import ScheduledAction, apply_costs, fill_price, signal_price
from ..backtest.sizing import entry_budget
from ..domain.enums import CloseReason, EventOrder, ExecutionModel, ThreadSelector, ThreadState
from ..domain.models import (
    BacktestRun,
    CapitalThread,
    DailySnapshot,
    MarketBar,
    StrategyConfig,
    StrategyEvent,
    Trade,
    compute_trade_pnl,
    new_run_id,
)
from ..domain.money import D, ZERO, quantize_entry_shares, quantize_money, quantize_shares


@dataclass
class StrategyResult:
    trades: list[Trade]
    events: list[StrategyEvent]
    daily: list[DailySnapshot]


def _entry_signal(session_price: Decimal, previous_price: Decimal, config: StrategyConfig) -> bool:
    threshold = previous_price * (D("1") - config.entry_drop_pct / D("100"))
    return session_price < threshold


def _take_profit_signal(session_price: Decimal, entry_price: Decimal, config: StrategyConfig) -> bool:
    threshold = entry_price * (D("1") + config.take_profit_pct / D("100"))
    if config.take_profit_operator == "gte":
        return session_price >= threshold
    return session_price > threshold


def _price_stop_signal(session_price: Decimal, entry_price: Decimal, config: StrategyConfig) -> bool:
    if config.stop_loss_pct <= ZERO:
        return False
    threshold = entry_price * (D("1") - config.stop_loss_pct / D("100"))
    return session_price <= threshold


def _select_thread(threads: list[CapitalThread], config: StrategyConfig, session_index: int) -> CapitalThread | None:
    free_threads = [thread for thread in threads if thread.state == ThreadState.FREE]
    if not config.allow_same_session_thread_reuse:
        free_threads = [
            thread for thread in free_threads if thread.last_closed_session_index != session_index
        ]
    if not free_threads:
        return None
    if config.thread_selector == ThreadSelector.LOWEST_ID:
        return min(free_threads, key=lambda item: item.thread_id)
    if config.thread_selector == ThreadSelector.OLDEST_FREE:
        return min(
            free_threads,
            key=lambda item: (
                item.last_closed_session_index if item.last_closed_session_index is not None else -1,
                item.thread_id,
            ),
        )
    return free_threads[0]


def _equity(threads: list[CapitalThread], mark_price: Decimal) -> Decimal:
    return sum((thread.total_equity(mark_price) for thread in threads), start=ZERO)


def _apply_split(thread: CapitalThread, split_ratio: Decimal) -> None:
    if split_ratio == D("1") or thread.state != ThreadState.OPEN:
        return
    thread.shares = quantize_shares(thread.shares * split_ratio)
    thread.entry_price = thread.entry_price / split_ratio


def _entry_shares(budget: Decimal, executed_price: Decimal) -> Decimal:
    shares = quantize_entry_shares(D(budget) / D(executed_price))
    return shares


def run_strategy(bars: list[MarketBar], config: StrategyConfig, *, data_hash: str = "adhoc") -> BacktestRun:
    if not bars:
        raise ValueError("No bars provided")
    run_id = new_run_id()
    initial_thread_principal = config.initial_capital / D(config.thread_count)
    threads = [
        CapitalThread(thread_id=index + 1, free_equity=initial_thread_principal)
        for index in range(config.thread_count)
    ]
    trades: list[Trade] = []
    open_trades: dict[int, Trade] = {}
    events: list[StrategyEvent] = []
    daily: list[DailySnapshot] = []
    pending_for_next: deque[ScheduledAction] = deque()
    realized_pnl = ZERO
    peak_equity = config.initial_capital

    for index, bar in enumerate(bars):
        session_price = signal_price(bar, config.price_basis)
        entries = 0
        take_profits = 0
        time_stops = 0
        skipped_entries = 0

        for thread in threads:
            _apply_split(thread, bar.split_ratio)

        if config.execution_model in {ExecutionModel.NEXT_OPEN, ExecutionModel.NEXT_CLOSE}:
            still_pending: deque[ScheduledAction] = deque()
            while pending_for_next:
                action = pending_for_next.popleft()
                if action.kind == "ENTRY":
                    thread = next(item for item in threads if item.thread_id == action.thread_id)
                    executed_price = fill_price(bar, config.execution_model, config.price_basis)
                    executed_price = apply_costs(
                        executed_price,
                        config.commission_bps,
                        config.slippage_bps,
                        is_buy=True,
                    )
                    budget = entry_budget(config, thread, _equity(threads, session_price), initial_thread_principal)
                    shares = _entry_shares(D(budget), D(executed_price))
                    if shares <= ZERO:
                        skipped_entries += 1
                        events.append(
                            StrategyEvent(
                                session_date=bar.session_date,
                                session_index=index,
                                thread_id=thread.thread_id,
                                event_type="ENTRY_SKIPPED",
                                price=D(executed_price),
                                detail="INSUFFICIENT_BUDGET",
                            )
                        )
                        continue
                    thread.state = ThreadState.OPEN
                    thread.entry_price = D(executed_price)
                    thread.shares = shares
                    thread.entry_session_index = index
                    thread.entry_date = bar.session_date
                    thread.invested_amount = quantize_money(shares * D(executed_price))
                    thread.reserve_pnl = quantize_money(thread.free_equity - thread.invested_amount)
                    open_trades[thread.thread_id] = Trade(
                        run_id=run_id,
                        thread_id=thread.thread_id,
                        signal_date=action.signal_date,
                        fill_entry_date=bar.session_date,
                        entry_price=D(executed_price),
                        shares=shares,
                        invested_amount=thread.invested_amount,
                    )
                    events.append(
                        StrategyEvent(
                            session_date=bar.session_date,
                            session_index=index,
                            thread_id=thread.thread_id,
                            event_type="ENTRY_FILL",
                            price=D(executed_price),
                        )
                    )
                    entries += 1
                elif action.kind == "EXIT":
                    thread = next(item for item in threads if item.thread_id == action.thread_id)
                    if thread.state != ThreadState.OPEN:
                        continue
                    executed_price = fill_price(bar, config.execution_model, config.price_basis)
                    executed_price = apply_costs(
                        executed_price,
                        config.commission_bps,
                        config.slippage_bps,
                        is_buy=False,
                    )
                    trade = open_trades.pop(thread.thread_id)
                    trade.exit_signal_date = action.signal_date
                    trade.fill_exit_date = bar.session_date
                    trade.exit_price = D(executed_price)
                    trade.holding_sessions = index - (thread.entry_session_index or index)
                    trade.close_reason = CloseReason(action.reason or CloseReason.END_OF_TEST.value)
                    compute_trade_pnl(trade)
                    proceeds = quantize_money(trade.shares * D(executed_price))
                    trades.append(trade)
                    realized_pnl += trade.pnl
                    thread.state = ThreadState.FREE
                    thread.free_equity = quantize_money(thread.reserve_pnl + proceeds)
                    thread.reserve_pnl = ZERO
                    thread.last_closed_session_index = index
                    thread.entry_price = ZERO
                    thread.shares = ZERO
                    thread.entry_session_index = None
                    thread.entry_date = None
                    thread.invested_amount = ZERO
                    events.append(
                        StrategyEvent(
                            session_date=bar.session_date,
                            session_index=index,
                            thread_id=thread.thread_id,
                            event_type="EXIT_FILL",
                            price=D(executed_price),
                            reason=action.reason,
                        )
                    )
                    if action.reason == CloseReason.TAKE_PROFIT.value:
                        take_profits += 1
                    elif action.reason in {CloseReason.TIME_STOP.value, CloseReason.PRICE_STOP.value}:
                        time_stops += 1
                else:
                    still_pending.append(action)
            pending_for_next = still_pending

        if index == 0:
            total_equity = _equity(threads, session_price)
            peak_equity = max(peak_equity, total_equity)
            drawdown = ZERO if peak_equity == ZERO else (total_equity - peak_equity) / peak_equity
            daily.append(
                DailySnapshot(
                    session_date=bar.session_date,
                    session_index=index,
                    total_equity=quantize_money(total_equity),
                    realized_pnl=quantize_money(realized_pnl),
                    drawdown=drawdown,
                    open_threads=sum(1 for thread in threads if thread.state == ThreadState.OPEN),
                    entries=entries,
                    take_profits=take_profits,
                    time_stops=time_stops,
                    skipped_entries=skipped_entries,
                )
            )
            continue

        previous_bar = bars[index - 1]
        previous_price = signal_price(previous_bar, config.price_basis)

        def close_thread(thread: CapitalThread, reason: CloseReason) -> None:
            nonlocal realized_pnl, take_profits, time_stops
            if config.execution_model == ExecutionModel.IDEAL_SAME_CLOSE:
                executed_price = apply_costs(
                    session_price,
                    config.commission_bps,
                    config.slippage_bps,
                    is_buy=False,
                )
                trade = open_trades.pop(thread.thread_id)
                trade.exit_signal_date = bar.session_date
                trade.fill_exit_date = bar.session_date
                trade.exit_price = D(executed_price)
                trade.holding_sessions = index - (thread.entry_session_index or index)
                trade.close_reason = reason
                compute_trade_pnl(trade)
                proceeds = quantize_money(trade.shares * D(executed_price))
                trades.append(trade)
                realized_pnl += trade.pnl
                thread.state = ThreadState.FREE
                thread.free_equity = quantize_money(thread.reserve_pnl + proceeds)
                thread.reserve_pnl = ZERO
                thread.last_closed_session_index = index
                thread.entry_price = ZERO
                thread.shares = ZERO
                thread.entry_session_index = None
                thread.entry_date = None
                thread.invested_amount = ZERO
                events.append(
                    StrategyEvent(
                        session_date=bar.session_date,
                        session_index=index,
                        thread_id=thread.thread_id,
                        event_type="EXIT",
                        price=D(executed_price),
                        reason=reason.value,
                    )
                )
                if reason == CloseReason.TAKE_PROFIT:
                    take_profits += 1
                else:
                    time_stops += 1
            else:
                pending_for_next.append(
                    ScheduledAction(
                        kind="EXIT",
                        thread_id=thread.thread_id,
                        signal_session_index=index,
                        signal_date=bar.session_date,
                        price_hint=session_price,
                        reason=reason.value,
                    )
                )

        def open_thread(thread: CapitalThread) -> None:
            nonlocal entries, skipped_entries
            if config.execution_model == ExecutionModel.IDEAL_SAME_CLOSE:
                executed_price = apply_costs(
                    session_price,
                    config.commission_bps,
                    config.slippage_bps,
                    is_buy=True,
                )
                budget = entry_budget(config, thread, _equity(threads, session_price), initial_thread_principal)
                shares = _entry_shares(D(budget), D(executed_price))
                if shares <= ZERO:
                    skipped_entries += 1
                    events.append(
                        StrategyEvent(
                            session_date=bar.session_date,
                            session_index=index,
                            thread_id=thread.thread_id,
                            event_type="ENTRY_SKIPPED",
                            price=D(executed_price),
                            detail="INSUFFICIENT_BUDGET",
                        )
                    )
                    return
                thread.state = ThreadState.OPEN
                thread.entry_price = D(executed_price)
                thread.shares = shares
                thread.entry_session_index = index
                thread.entry_date = bar.session_date
                thread.invested_amount = quantize_money(shares * D(executed_price))
                thread.reserve_pnl = quantize_money(thread.free_equity - thread.invested_amount)
                open_trades[thread.thread_id] = Trade(
                    run_id=run_id,
                    thread_id=thread.thread_id,
                    signal_date=bar.session_date,
                    fill_entry_date=bar.session_date,
                    entry_price=D(executed_price),
                    shares=shares,
                    invested_amount=thread.invested_amount,
                )
                entries += 1
                events.append(
                    StrategyEvent(
                        session_date=bar.session_date,
                        session_index=index,
                        thread_id=thread.thread_id,
                        event_type="ENTRY",
                        price=D(executed_price),
                    )
                )
            else:
                pending_for_next.append(
                    ScheduledAction(
                        kind="ENTRY",
                        thread_id=thread.thread_id,
                        signal_session_index=index,
                        signal_date=bar.session_date,
                        price_hint=session_price,
                    )
                )

        def process_exits() -> None:
            for thread in list(threads):
                if thread.state != ThreadState.OPEN or thread.entry_session_index is None:
                    continue
                age = index - thread.entry_session_index
                profitable = _take_profit_signal(session_price, thread.entry_price, config)
                price_stop_due = _price_stop_signal(session_price, thread.entry_price, config)
                time_stop_due = age >= config.stop_sessions and session_price <= thread.entry_price
                if config.profit_precedes_stop:
                    if profitable:
                        close_thread(thread, CloseReason.TAKE_PROFIT)
                    elif price_stop_due:
                        close_thread(thread, CloseReason.PRICE_STOP)
                    elif time_stop_due:
                        close_thread(thread, CloseReason.TIME_STOP)
                else:
                    if price_stop_due:
                        close_thread(thread, CloseReason.PRICE_STOP)
                    elif time_stop_due:
                        close_thread(thread, CloseReason.TIME_STOP)
                    elif profitable:
                        close_thread(thread, CloseReason.TAKE_PROFIT)

        def process_entry() -> None:
            nonlocal skipped_entries
            if not _entry_signal(session_price, previous_price, config):
                return
            opened = 0
            for _ in range(config.max_entries_per_session):
                thread = _select_thread(threads, config, index)
                if thread is None:
                    if opened == 0:
                        skipped_entries += 1
                        events.append(
                            StrategyEvent(
                                session_date=bar.session_date,
                                session_index=index,
                                thread_id=None,
                                event_type="SKIPPED_NO_FREE_THREAD",
                            )
                        )
                    return
                open_thread(thread)
                opened += 1

        if config.event_order == EventOrder.EXITS_THEN_ENTRY:
            process_exits()
            process_entry()
        else:
            process_entry()
            process_exits()

        total_equity = _equity(threads, session_price)
        peak_equity = max(peak_equity, total_equity)
        drawdown = ZERO if peak_equity == ZERO else (total_equity - peak_equity) / peak_equity
        daily.append(
            DailySnapshot(
                session_date=bar.session_date,
                session_index=index,
                total_equity=quantize_money(total_equity),
                realized_pnl=quantize_money(realized_pnl),
                drawdown=drawdown,
                open_threads=sum(1 for thread in threads if thread.state == ThreadState.OPEN),
                entries=entries,
                take_profits=take_profits,
                time_stops=time_stops,
                skipped_entries=skipped_entries,
            )
        )

    if config.end_of_test.value == "force_close":
        last_bar = bars[-1]
        last_price = signal_price(last_bar, config.price_basis)
        for thread in threads:
            if thread.state != ThreadState.OPEN:
                continue
            trade = open_trades.pop(thread.thread_id)
            trade.exit_signal_date = last_bar.session_date
            trade.fill_exit_date = last_bar.session_date
            trade.exit_price = D(last_price)
            trade.holding_sessions = len(bars) - 1 - (thread.entry_session_index or 0)
            trade.close_reason = CloseReason.END_OF_TEST
            compute_trade_pnl(trade)
            trades.append(trade)

    return BacktestRun(
        run_id=run_id,
        config=config,
        data_hash=data_hash,
        trades=trades,
        events=events,
        daily=daily,
        yearly={},
        metrics={},
    )
