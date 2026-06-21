from __future__ import annotations

from dataclasses import replace
from datetime import date
from decimal import Decimal

from ..domain.models import MarketBar
from ..domain.money import D


def build_single_stock_leveraged_history(
    *,
    symbol: str,
    underlying_bars: list[MarketBar],
    actual_bars: list[MarketBar],
    dataset_start_date: str,
    actual_start_date: str,
    leverage_factor: Decimal,
) -> list[MarketBar]:
    start_value = date.fromisoformat(dataset_start_date)
    actual_start = date.fromisoformat(actual_start_date)
    prelisting_underlying = [bar for bar in underlying_bars if start_value <= bar.session_date <= actual_start]
    if not prelisting_underlying:
        raise ValueError(f"No underlying bars available for {symbol} between {dataset_start_date} and {actual_start_date}")
    actual_rows = [bar for bar in actual_bars if bar.session_date >= actual_start]
    if not actual_rows:
        raise ValueError(f"No actual bars available for {symbol} on or after {actual_start_date}")
    anchor_bar = next((bar for bar in actual_rows if bar.session_date == actual_start), None)
    if anchor_bar is None:
        raise ValueError(f"Missing anchor bar for {symbol} on {actual_start_date}")

    normalized_rows: list[MarketBar] = [
        MarketBar(
            symbol=symbol,
            session_date=prelisting_underlying[0].session_date,
            open=D("1"),
            high=D("1"),
            low=D("1"),
            close=D("1"),
            adj_close=D("1"),
            volume=0,
            source="synthetic_naver",
        )
    ]
    previous_underlying_close = prelisting_underlying[0].close
    previous_synthetic_close = D("1")

    for bar in prelisting_underlying[1:]:
        synthetic_open = previous_synthetic_close * _leveraged_multiplier(bar.open / previous_underlying_close, leverage_factor)
        synthetic_high = previous_synthetic_close * _leveraged_multiplier(bar.high / previous_underlying_close, leverage_factor)
        synthetic_low = previous_synthetic_close * _leveraged_multiplier(bar.low / previous_underlying_close, leverage_factor)
        synthetic_close = previous_synthetic_close * _leveraged_multiplier(bar.close / previous_underlying_close, leverage_factor)
        ordered_high = max(synthetic_open, synthetic_high, synthetic_low, synthetic_close)
        ordered_low = min(synthetic_open, synthetic_high, synthetic_low, synthetic_close)
        normalized_rows.append(
            MarketBar(
                symbol=symbol,
                session_date=bar.session_date,
                open=synthetic_open,
                high=ordered_high,
                low=ordered_low,
                close=synthetic_close,
                adj_close=synthetic_close,
                volume=0,
                source="synthetic_naver",
            )
        )
        previous_underlying_close = bar.close
        previous_synthetic_close = synthetic_close

    anchor_close = normalized_rows[-1].close
    if anchor_close <= D("0"):
        raise ValueError(f"Synthetic anchor close must be positive for {symbol}")
    scale_factor = anchor_bar.close / anchor_close
    prelisting_rows: list[MarketBar] = []
    for bar in normalized_rows[:-1]:
        scaled = _scale_bar(bar, scale_factor)
        _validate_positive_prices(scaled)
        prelisting_rows.append(scaled)

    merged_rows = prelisting_rows + [
        replace(bar, symbol=symbol, adj_close=bar.close if bar.adj_close == bar.close else bar.adj_close)
        for bar in actual_rows
    ]
    return merged_rows


def _leveraged_multiplier(relative_move: Decimal, leverage_factor: Decimal) -> Decimal:
    multiplier = D("1") + (leverage_factor * (relative_move - D("1")))
    if multiplier <= D("0"):
        raise ValueError(f"Synthetic leveraged multiplier became non-positive: {multiplier}")
    return multiplier


def _scale_bar(bar: MarketBar, scale_factor: Decimal) -> MarketBar:
    return replace(
        bar,
        open=bar.open * scale_factor,
        high=bar.high * scale_factor,
        low=bar.low * scale_factor,
        close=bar.close * scale_factor,
        adj_close=bar.adj_close * scale_factor,
    )


def _validate_positive_prices(bar: MarketBar) -> None:
    if min(bar.open, bar.high, bar.low, bar.close, bar.adj_close) <= D("0"):
        raise ValueError(f"Synthetic bar contains a non-positive price for {bar.session_date.isoformat()}")
