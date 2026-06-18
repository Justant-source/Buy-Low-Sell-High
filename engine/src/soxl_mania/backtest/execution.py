from __future__ import annotations

from dataclasses import dataclass

from ..domain.enums import ExecutionModel, PriceBasis
from ..domain.models import MarketBar
from ..domain.money import D


@dataclass(frozen=True)
class ScheduledAction:
    kind: str
    thread_id: int
    signal_session_index: int
    signal_date: object
    price_hint: object
    reason: str | None = None


def signal_price(bar: MarketBar, basis: PriceBasis) -> object:
    return bar.price_for_basis(basis)


def fill_price(bar: MarketBar, model: ExecutionModel, basis: PriceBasis) -> object:
    if model == ExecutionModel.IDEAL_SAME_CLOSE:
        return signal_price(bar, basis)
    if model == ExecutionModel.NEXT_OPEN:
        return bar.open
    if model == ExecutionModel.NEXT_CLOSE:
        return signal_price(bar, basis)
    return signal_price(bar, basis)


def apply_costs(price: object, commission_bps: object, slippage_bps: object, *, is_buy: bool) -> object:
    adjustment = D("1") + ((D(commission_bps) + D(slippage_bps)) / D("10000"))
    if is_buy:
        return D(price) * adjustment
    return D(price) / adjustment

