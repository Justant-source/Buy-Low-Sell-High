from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
import json
from pathlib import Path

from ..domain.models import ManualFill, ManualLedger, ManualThreadState, new_fill_id
from ..domain.money import D, ZERO


def utc_now() -> datetime:
    return datetime.now(UTC)


def create_ledger(account_id: str, thread_count: int, initial_capital: object) -> ManualLedger:
    per_thread = D(initial_capital) / D(thread_count)
    return ManualLedger(
        account_id=account_id,
        threads={index + 1: ManualThreadState(thread_id=index + 1, cash=per_thread) for index in range(thread_count)},
    )


def record_fill(
    ledger: ManualLedger,
    *,
    thread_id: int,
    side: str,
    quantity: object,
    price: object,
    fee: object = ZERO,
    filled_at: datetime | None = None,
) -> ManualFill:
    thread = ledger.threads[thread_id]
    quantity_d = D(quantity)
    price_d = D(price)
    fee_d = D(fee)
    if side == "BUY":
        thread.cash -= (quantity_d * price_d) + fee_d
        thread.quantity += quantity_d
        thread.entry_price = price_d
        thread.entry_date = (filled_at or utc_now()).date()
    elif side == "SELL":
        thread.cash += (quantity_d * price_d) - fee_d
        thread.quantity -= quantity_d
        if thread.quantity == ZERO:
            thread.entry_price = ZERO
            thread.entry_date = None
    else:
        raise ValueError(f"Unsupported side: {side}")
    fill = ManualFill(
        fill_id=new_fill_id(),
        thread_id=thread_id,
        side=side,
        quantity=quantity_d,
        price=price_d,
        fee=fee_d,
        filled_at=filled_at or utc_now(),
    )
    ledger.fills.append(fill)
    return fill


def reverse_fill(ledger: ManualLedger, fill_id: str) -> ManualFill:
    original = next(fill for fill in ledger.fills if fill.fill_id == fill_id)
    if original.reversed_by_fill_id is not None:
        raise ValueError("Fill already reversed")
    reverse_side = "SELL" if original.side == "BUY" else "BUY"
    reversal = record_fill(
        ledger,
        thread_id=original.thread_id,
        side=reverse_side,
        quantity=original.quantity,
        price=original.price,
        fee=ZERO,
        filled_at=utc_now(),
    )
    original.reversed_by_fill_id = reversal.fill_id
    return reversal


def export_ledger(ledger: ManualLedger) -> str:
    payload = {
        "account_id": ledger.account_id,
        "threads": {
            str(thread_id): {
                "cash": str(thread.cash),
                "quantity": str(thread.quantity),
                "entry_price": str(thread.entry_price),
                "entry_date": thread.entry_date.isoformat() if thread.entry_date else None,
            }
            for thread_id, thread in ledger.threads.items()
        },
        "fills": [
            {
                "fill_id": fill.fill_id,
                "thread_id": fill.thread_id,
                "side": fill.side,
                "quantity": str(fill.quantity),
                "price": str(fill.price),
                "fee": str(fill.fee),
                "filled_at": fill.filled_at.isoformat(),
                "reversed_by_fill_id": fill.reversed_by_fill_id,
            }
            for fill in ledger.fills
        ],
    }
    return json.dumps(payload, sort_keys=True)


def import_ledger(payload: str) -> ManualLedger:
    raw = json.loads(payload)
    return ManualLedger(
        account_id=raw["account_id"],
        threads={
            int(thread_id): ManualThreadState(
                thread_id=int(thread_id),
                cash=D(thread["cash"]),
                quantity=D(thread["quantity"]),
                entry_price=D(thread["entry_price"]),
                entry_date=datetime.fromisoformat(thread["entry_date"]).date() if thread["entry_date"] else None,
            )
            for thread_id, thread in raw["threads"].items()
        },
        fills=[
            ManualFill(
                fill_id=fill["fill_id"],
                thread_id=int(fill["thread_id"]),
                side=fill["side"],
                quantity=D(fill["quantity"]),
                price=D(fill["price"]),
                fee=D(fill["fee"]),
                filled_at=datetime.fromisoformat(fill["filled_at"]),
                reversed_by_fill_id=fill["reversed_by_fill_id"],
            )
            for fill in raw["fills"]
        ],
    )


def save_ledger(path: str | Path, ledger: ManualLedger) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(export_ledger(ledger), encoding="utf-8")


def load_ledger(path: str | Path) -> ManualLedger:
    return import_ledger(Path(path).read_text(encoding="utf-8"))


def summarize_ledger(ledger: ManualLedger) -> dict[str, object]:
    total_cash = sum((thread.cash for thread in ledger.threads.values()), start=ZERO)
    total_quantity = sum((thread.quantity for thread in ledger.threads.values()), start=ZERO)
    open_threads = sum(1 for thread in ledger.threads.values() if thread.quantity > ZERO)
    return {
        "account_id": ledger.account_id,
        "thread_count": len(ledger.threads),
        "fill_count": len(ledger.fills),
        "open_threads": open_threads,
        "total_cash": str(total_cash),
        "total_quantity": str(total_quantity),
    }
