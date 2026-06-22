from __future__ import annotations

from dataclasses import dataclass

from ..domain.enums import ExecutionModel, PriceBasis
from ..domain.models import MarketBar
from ..domain.money import D, quantize_money


@dataclass(frozen=True)
class ScheduledAction:
    kind: str
    thread_id: int
    signal_session_index: int
    signal_date: object
    price_hint: object
    reason: str | None = None
    regime: str = "neutral"
    stop_sessions: int = 0
    take_profit_pct: object = 0
    buy_pct: object = 0


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


def total_cost_rate(
    commission_bps: object,
    transaction_tax_bps: object,
    slippage_bps: object,
) -> object:
    return (D(commission_bps) + D(transaction_tax_bps) + D(slippage_bps)) / D("10000")


def apply_costs(
    price: object,
    commission_bps: object,
    transaction_tax_bps: object,
    slippage_bps: object,
    *,
    is_buy: bool,
) -> object:
    adjustment = total_cost_rate(commission_bps, transaction_tax_bps, slippage_bps)
    if is_buy:
        return D(price) * (D("1") + adjustment)
    return D(price) * (D("1") - adjustment)


def fill_fee_amount(
    price: object,
    shares: object,
    commission_bps: object,
    transaction_tax_bps: object,
    slippage_bps: object,
) -> object:
    gross_notional = D(price) * D(shares)
    return quantize_money(gross_notional * total_cost_rate(commission_bps, transaction_tax_bps, slippage_bps))


def effective_buy_fee_amount(
    invested_amount: object,
    commission_bps: object,
    transaction_tax_bps: object,
    slippage_bps: object,
) -> object:
    rate = total_cost_rate(commission_bps, transaction_tax_bps, slippage_bps)
    if rate <= D("0"):
        return D("0")
    gross_amount = D(invested_amount) / (D("1") + rate)
    return quantize_money(D(invested_amount) - gross_amount)


def effective_sell_fee_amount(
    net_proceeds: object,
    commission_bps: object,
    transaction_tax_bps: object,
    slippage_bps: object,
) -> object:
    rate = total_cost_rate(commission_bps, transaction_tax_bps, slippage_bps)
    if rate <= D("0"):
        return D("0")
    gross_amount = D(net_proceeds) / (D("1") - rate)
    return quantize_money(gross_amount - D(net_proceeds))
