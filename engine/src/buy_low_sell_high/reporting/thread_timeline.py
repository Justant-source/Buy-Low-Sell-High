from __future__ import annotations

from collections import defaultdict, deque
from datetime import date
from decimal import Decimal
from typing import Any

from ..backtest.engine import run_backtest
from ..backtest.execution import effective_buy_fee_amount, effective_sell_fee_amount, signal_price
from ..backtest.regime import load_regime_context
from ..backtest.sizing import entry_budget
from ..domain.enums import CloseReason, ThreadState
from ..domain.models import CapitalThread, MarketBar, StrategyConfig, Trade, compute_trade_pnl
from ..domain.money import D, ZERO, quantize_entry_shares, quantize_money, quantize_shares
from .research_common import CORE_PROFILE_CATALOG, CORE_PROFILE_CATALOG_ID, catalog_hash
from .strategy_specs import build_strategy_config, resolve_strategy_spec


def _portfolio_equity(thread_states: dict[int, dict[str, Any]], mark_price: Decimal) -> Decimal:
    total = ZERO
    for thread in thread_states.values():
        if thread["state"] == ThreadState.OPEN:
            total += thread["reserve_pnl"] + (thread["shares"] * mark_price)
        else:
            total += thread["free_equity"]
    return total


def _find_matching_trade(queue: deque[Trade], entry_date: date) -> Trade | None:
    while queue and queue[0].fill_entry_date < entry_date:
        queue.popleft()
    if queue and queue[0].fill_entry_date == entry_date:
        return queue.popleft()
    return None


def _make_trade_id(strategy_id: str, thread_id: int, entry_date: date, sequence: int) -> str:
    return f"{strategy_id}-t{thread_id}-{entry_date.isoformat()}-{sequence}"


def _serialize_interval(position: dict[str, Any], period_end: date) -> dict[str, Any]:
    exit_trade = position.get("closed_trade")
    end_date = exit_trade.fill_exit_date if exit_trade and exit_trade.fill_exit_date else None
    entry_fee = D(position.get("entry_fee", ZERO))
    exit_fee = D(exit_trade.exit_fee) if exit_trade else ZERO
    return {
        "trade_id": position["trade_id"],
        "thread_id": position["thread_id"],
        "start_date": position["entry_date"].isoformat(),
        "end_date": end_date.isoformat() if end_date else None,
        "visible_end_date": (end_date or period_end).isoformat(),
        "entry_price": str(position["entry_price"]),
        "exit_price": str(exit_trade.exit_price) if exit_trade and exit_trade.exit_price is not None else None,
        "shares": str(position["entry_shares"]),
        "invested_amount": str(position["invested_amount"]),
        "entry_fee": str(entry_fee),
        "exit_fee": str(exit_fee),
        "total_fees": str(quantize_money(entry_fee + exit_fee)),
        "close_reason": exit_trade.close_reason.value if exit_trade and exit_trade.close_reason else None,
        "pnl": str(exit_trade.pnl) if exit_trade else None,
        "return_pct": str(exit_trade.return_pct) if exit_trade else None,
        "holding_sessions": exit_trade.holding_sessions if exit_trade else None,
        "status": "CLOSED" if exit_trade else "OPEN",
    }


def build_thread_timeline(
    bars: list[MarketBar],
    base_config: StrategyConfig,
    *,
    strategy_id: str,
    data_hash: str = "adhoc",
    catalog: tuple[dict[str, Any], ...] = CORE_PROFILE_CATALOG,
    catalog_id: str = CORE_PROFILE_CATALOG_ID,
    execution_model: str = "ideal_same_close",
    price_basis: str = "adjusted_close",
) -> dict[str, Any]:
    if not bars:
        raise ValueError("No bars provided")

    strategy_spec = resolve_strategy_spec(strategy_id, catalog=catalog)
    config = build_strategy_config(
        base_config,
        strategy_spec,
        execution_model=execution_model,
        price_basis=price_basis,
    )
    regime_context = load_regime_context(bars, config)
    run = run_backtest(bars, config, data_hash=data_hash, regime_context=regime_context)
    period_start = bars[0].session_date
    period_end = bars[-1].session_date
    daily_by_date = {snapshot.session_date: snapshot for snapshot in run.daily}
    events_by_date: dict[date, list[Any]] = defaultdict(list)
    for event in run.events:
        events_by_date[event.session_date].append(event)

    thread_trade_queues: dict[int, deque[Trade]] = defaultdict(deque)
    for trade in sorted(
        run.trades,
        key=lambda item: (
            item.thread_id,
            item.fill_entry_date,
            item.fill_exit_date or period_end,
        ),
    ):
        thread_trade_queues[trade.thread_id].append(trade)

    initial_thread_principal = config.initial_capital / D(config.thread_count)
    thread_states: dict[int, dict[str, Any]] = {
        thread_id: {
            "thread_id": thread_id,
            "state": ThreadState.FREE,
            "reserve_pnl": ZERO,
            "free_equity": initial_thread_principal,
            "entry_price": ZERO,
            "shares": ZERO,
            "entry_session_index": None,
            "entry_date": None,
            "invested_amount": ZERO,
            "last_closed_session_index": None,
        }
        for thread_id in range(1, config.thread_count + 1)
    }
    open_positions: dict[int, dict[str, Any]] = {}
    lanes: dict[int, list[dict[str, Any]]] = {thread_id: [] for thread_id in thread_states}
    sessions: list[dict[str, Any]] = []
    interval_sequence = 0

    for bar in bars:
        session_price = signal_price(bar, config.price_basis)
        daily_snapshot = daily_by_date[bar.session_date]
        entry_batch: list[dict[str, Any]] = []
        exit_batch: list[dict[str, Any]] = []

        if bar.split_ratio != D("1"):
            for position in open_positions.values():
                position["current_shares"] = quantize_shares(position["current_shares"] * bar.split_ratio)
                position["current_entry_price"] = position["current_entry_price"] / bar.split_ratio
                thread_state = thread_states[position["thread_id"]]
                thread_state["shares"] = position["current_shares"]
                thread_state["entry_price"] = position["current_entry_price"]

        for event in events_by_date.get(bar.session_date, []):
            if event.thread_id is None:
                continue
            thread_id = int(event.thread_id)
            thread_state = thread_states[thread_id]
            if event.event_type in {"ENTRY", "ENTRY_FILL"}:
                matched_trade = _find_matching_trade(thread_trade_queues[thread_id], bar.session_date)
                budget = entry_budget(
                    config,
                    CapitalThread(
                        thread_id=thread_id,
                        state=thread_state["state"],
                        reserve_pnl=thread_state["reserve_pnl"],
                        free_equity=thread_state["free_equity"],
                    ),
                    _portfolio_equity(thread_states, session_price),
                    initial_thread_principal,
                )
                entry_price = Decimal(event.price) if event.price is not None else session_price
                shares = matched_trade.shares if matched_trade is not None else quantize_entry_shares(D(budget) / D(entry_price))
                invested_amount = matched_trade.invested_amount if matched_trade is not None else quantize_money(shares * D(entry_price))
                entry_fee = matched_trade.entry_fee if matched_trade is not None else effective_buy_fee_amount(
                    invested_amount,
                    config.commission_bps,
                    config.transaction_tax_bps,
                    config.slippage_bps,
                )
                interval_sequence += 1
                trade_id = _make_trade_id(strategy_id, thread_id, bar.session_date, interval_sequence)
                position = {
                    "trade_id": trade_id,
                    "thread_id": thread_id,
                    "entry_date": bar.session_date,
                    "entry_session_index": daily_snapshot.session_index,
                    "entry_price": D(entry_price),
                    "current_entry_price": D(entry_price),
                    "entry_shares": shares,
                    "current_shares": shares,
                    "invested_amount": invested_amount,
                    "entry_fee": D(entry_fee),
                    "matched_trade": matched_trade,
                    "closed_trade": None,
                }
                open_positions[thread_id] = position
                lanes[thread_id].append(position)
                thread_state["state"] = ThreadState.OPEN
                thread_state["entry_price"] = position["current_entry_price"]
                thread_state["shares"] = position["current_shares"]
                thread_state["entry_session_index"] = daily_snapshot.session_index
                thread_state["entry_date"] = bar.session_date
                thread_state["invested_amount"] = invested_amount
                thread_state["reserve_pnl"] = quantize_money(thread_state["free_equity"] - invested_amount)
                entry_batch.append(
                    {
                        "trade_id": trade_id,
                        "thread_id": thread_id,
                        "entry_price": str(position["entry_price"]),
                        "shares": str(position["entry_shares"]),
                        "invested_amount": str(position["invested_amount"]),
                        "entry_fee": str(position["entry_fee"]),
                        "entry_regime": matched_trade.entry_regime if matched_trade is not None else "neutral",
                    }
                )
                continue

            if event.event_type not in {"EXIT", "EXIT_FILL"}:
                continue
            position = open_positions.pop(thread_id, None)
            if position is None:
                continue
            matched_trade = position["matched_trade"]
            exit_price = Decimal(event.price) if event.price is not None else session_price
            close_reason = CloseReason(event.reason) if event.reason else CloseReason.END_OF_TEST
            if matched_trade is None:
                matched_trade = Trade(
                    run_id=run.run_id,
                    thread_id=thread_id,
                    signal_date=position["entry_date"],
                    fill_entry_date=position["entry_date"],
                    entry_price=position["entry_price"],
                    shares=position["entry_shares"],
                    invested_amount=position["invested_amount"],
                    entry_fee=D(position.get("entry_fee", ZERO)),
                    exit_signal_date=bar.session_date,
                    fill_exit_date=bar.session_date,
                    exit_price=D(exit_price),
                    exit_fee=effective_sell_fee_amount(
                        quantize_money(position["current_shares"] * D(exit_price)),
                        config.commission_bps,
                        config.transaction_tax_bps,
                        config.slippage_bps,
                    ),
                    holding_sessions=daily_snapshot.session_index - position["entry_session_index"],
                    close_reason=close_reason,
                )
                compute_trade_pnl(matched_trade)
            position["closed_trade"] = matched_trade
            proceeds = quantize_money(
                position["current_shares"] * D(matched_trade.exit_price if matched_trade.exit_price is not None else exit_price)
            )
            thread_state["state"] = ThreadState.FREE
            thread_state["free_equity"] = quantize_money(thread_state["reserve_pnl"] + proceeds)
            thread_state["reserve_pnl"] = ZERO
            thread_state["last_closed_session_index"] = daily_snapshot.session_index
            thread_state["entry_price"] = ZERO
            thread_state["shares"] = ZERO
            thread_state["entry_session_index"] = None
            thread_state["entry_date"] = None
            thread_state["invested_amount"] = ZERO
            exit_batch.append(
                {
                    "trade_id": position["trade_id"],
                    "thread_id": thread_id,
                    "close_reason": matched_trade.close_reason.value if matched_trade.close_reason else close_reason.value,
                    "entry_price": str(position["entry_price"]),
                    "exit_price": str(matched_trade.exit_price if matched_trade.exit_price is not None else exit_price),
                    "entry_fee": str(position.get("entry_fee", ZERO)),
                    "exit_fee": str(matched_trade.exit_fee),
                    "total_fees": str(quantize_money(D(position.get("entry_fee", ZERO)) + D(matched_trade.exit_fee))),
                    "pnl": str(matched_trade.pnl),
                    "return_pct": str(matched_trade.return_pct),
                    "holding_sessions": matched_trade.holding_sessions,
                    "entry_regime": matched_trade.entry_regime,
                }
            )

        open_position_rows: list[dict[str, Any]] = []
        for thread_id in sorted(open_positions):
            position = open_positions[thread_id]
            marked_value = quantize_money(position["current_shares"] * session_price)
            unrealized_pnl = quantize_money(marked_value - position["invested_amount"])
            open_position_rows.append(
                {
                    "trade_id": position["trade_id"],
                    "thread_id": thread_id,
                    "entry_price": str(position["current_entry_price"]),
                    "shares": str(position["current_shares"]),
                    "invested_amount": str(position["invested_amount"]),
                    "entry_fee": str(position.get("entry_fee", ZERO)),
                    "mark_price": str(session_price),
                    "marked_value": str(marked_value),
                    "unrealized_pnl": str(unrealized_pnl),
                    "age_sessions": daily_snapshot.session_index - position["entry_session_index"],
                }
            )

        sessions.append(
            {
                "session_date": bar.session_date.isoformat(),
                "session_index": daily_snapshot.session_index,
                "close_price": str(session_price),
                "open_threads": len(open_position_rows),
                "entries": len(entry_batch),
                "exit_count": len(exit_batch),
                "skipped_entries": daily_snapshot.skipped_entries,
                "applied_regime": daily_snapshot.applied_regime,
                "entry_batch": entry_batch,
                "exit_batch": exit_batch,
                "open_positions": open_position_rows,
            }
        )

    lane_payload = [
        {
            "thread_id": thread_id,
            "label": f"Thread {thread_id}",
            "intervals": [_serialize_interval(position, period_end) for position in intervals],
        }
        for thread_id, intervals in sorted(lanes.items())
    ]

    entry_sessions = sum(1 for session in sessions if session["entries"] > 0)
    exit_sessions = sum(1 for session in sessions if session["exit_count"] > 0)
    return {
        "meta": {
            "catalog_id": catalog_id,
            "catalog_hash": catalog_hash(catalog),
            "strategy_id": strategy_id,
            "label": str(strategy_spec["label"]),
            "symbol": config.symbol,
            "thread_count": config.thread_count,
            "stop_sessions": config.stop_sessions,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "data_hash": data_hash,
            "config_hash": config.config_hash(),
            "code_commit": run.code_commit,
            "execution_model": config.execution_model.value,
            "price_basis": config.price_basis.value,
            "commission_bps": str(config.commission_bps),
            "transaction_tax_bps": str(config.transaction_tax_bps),
            "slippage_bps": str(config.slippage_bps),
            "regime_enabled": config.regime_enabled,
            "regime_symbol": config.regime_symbol,
            "regime_data_hash": run.regime_data_hash,
            "regime_config_hash": run.regime_config_hash,
        },
        "lanes": lane_payload,
        "sessions": sessions,
        "summary": {
            "max_open_threads": max((session["open_threads"] for session in sessions), default=0),
            "entry_sessions": entry_sessions,
            "exit_sessions": exit_sessions,
            "total_entries": sum(session["entries"] for session in sessions),
            "total_exits": sum(session["exit_count"] for session in sessions),
            "latest_open_threads": sessions[-1]["open_threads"] if sessions else 0,
        },
    }
