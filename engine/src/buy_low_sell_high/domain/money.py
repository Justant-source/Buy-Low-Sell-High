from __future__ import annotations

from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP, getcontext

getcontext().prec = 50

ZERO = Decimal("0")


def D(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_shares(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)


def quantize_entry_shares(value: Decimal) -> Decimal:
    return value.to_integral_value(rounding=ROUND_DOWN)


def require_positive_integer_quantity(value: object, *, field_name: str = "quantity") -> Decimal:
    quantity = D(value)
    if quantity != quantity.to_integral_value():
        raise ValueError(f"{field_name} must be a whole number")
    if quantity <= ZERO:
        raise ValueError(f"{field_name} must be > 0")
    return quantity


def require_non_negative_integer_quantity(value: object, *, field_name: str = "quantity") -> Decimal:
    quantity = D(value)
    if quantity != quantity.to_integral_value():
        raise ValueError(f"{field_name} must be a whole number")
    if quantity < ZERO:
        raise ValueError(f"{field_name} must be >= 0")
    return quantity
