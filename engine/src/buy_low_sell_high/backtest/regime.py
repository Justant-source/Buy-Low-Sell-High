from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from ..data.normalize import normalize_bars
from ..data.providers.csv_provider import CsvMarketDataProvider
from ..data.quality import compute_data_hash
from ..domain.models import MarketBar, StrategyConfig
from ..domain.money import D, ZERO
from ..symbols import default_market_data_csv


SUPPORTED_PRIMARY_SYMBOL = "SOXL"
DEFAULT_REGIME_LABEL = "neutral"
ATTACK_REGIME_LABEL = "attack"
DEFENSE_REGIME_LABEL = "defense"


@dataclass(frozen=True)
class SessionRegimeParameters:
    regime: str
    stop_sessions: int
    buy_pct: Decimal
    sell_pct: Decimal
    completed_week_rsi: Decimal | None = None


@dataclass(frozen=True)
class ResolvedRegimeContext:
    enabled: bool
    symbol: str
    data_hash: str | None
    config_hash: str
    session_parameters_by_date: dict[date, SessionRegimeParameters]

    def parameters_for_session(self, session_date: date) -> SessionRegimeParameters:
        return self.session_parameters_by_date.get(session_date) or SessionRegimeParameters(
            regime=DEFAULT_REGIME_LABEL,
            stop_sessions=0,
            buy_pct=ZERO,
            sell_pct=ZERO,
        )


def regime_feature_enabled(config: StrategyConfig) -> bool:
    return bool(config.regime_enabled and str(config.symbol).upper() == SUPPORTED_PRIMARY_SYMBOL)


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def disabled_regime_parameters(config: StrategyConfig) -> SessionRegimeParameters:
    return SessionRegimeParameters(
        regime=DEFAULT_REGIME_LABEL,
        stop_sessions=config.stop_sessions,
        buy_pct=config.entry_drop_pct,
        sell_pct=config.take_profit_pct,
    )


def _base_parameters(config: StrategyConfig, regime: str = DEFAULT_REGIME_LABEL) -> SessionRegimeParameters:
    if regime == ATTACK_REGIME_LABEL:
        return SessionRegimeParameters(
            regime=regime,
            stop_sessions=config.regime_bull_stop_sessions,
            buy_pct=config.regime_bull_buy_pct,
            sell_pct=config.regime_bull_sell_pct,
        )
    if regime == DEFENSE_REGIME_LABEL:
        return SessionRegimeParameters(
            regime=regime,
            stop_sessions=config.regime_bear_stop_sessions,
            buy_pct=config.regime_bear_buy_pct,
            sell_pct=config.regime_bear_sell_pct,
        )
    return SessionRegimeParameters(
        regime=DEFAULT_REGIME_LABEL,
        stop_sessions=config.regime_base_stop_sessions,
        buy_pct=config.regime_base_buy_pct,
        sell_pct=config.regime_base_sell_pct,
    )


def _parameters_for_regime(
    config: StrategyConfig,
    regime: str,
    *,
    completed_week_rsi: Decimal | None = None,
) -> SessionRegimeParameters:
    base = _base_parameters(config, regime)
    return SessionRegimeParameters(
        regime=base.regime,
        stop_sessions=base.stop_sessions,
        buy_pct=base.buy_pct,
        sell_pct=base.sell_pct,
        completed_week_rsi=completed_week_rsi,
    )


def _weekly_close_points(bars: list[MarketBar]) -> list[dict[str, Decimal | date | None]]:
    by_week: "OrderedDict[date, dict[str, Decimal | date | None]]" = OrderedDict()
    for bar in sorted(bars, key=lambda item: item.session_date):
        week_start = _week_start(bar.session_date)
        by_week[week_start] = {
            "week_start": week_start,
            "week_end": bar.session_date,
            "close": bar.adj_close,
            "rsi": None,
        }
    return list(by_week.values())


def _wilder_rsi(avg_gain: Decimal, avg_loss: Decimal) -> Decimal:
    if avg_loss == ZERO:
        if avg_gain == ZERO:
            return D("50")
        return D("100")
    relative_strength = avg_gain / avg_loss
    return D("100") - (D("100") / (D("1") + relative_strength))


def _apply_weekly_rsi(points: list[dict[str, Decimal | date | None]], period: int) -> None:
    if len(points) <= period:
        return
    period_decimal = D(period)
    changes = [
        D(points[index]["close"]) - D(points[index - 1]["close"])
        for index in range(1, len(points))
    ]
    avg_gain = sum((max(change, ZERO) for change in changes[:period]), start=ZERO) / period_decimal
    avg_loss = sum((max(-change, ZERO) for change in changes[:period]), start=ZERO) / period_decimal
    points[period]["rsi"] = _wilder_rsi(avg_gain, avg_loss)
    for index in range(period + 1, len(points)):
        change = changes[index - 1]
        gain = max(change, ZERO)
        loss = max(-change, ZERO)
        avg_gain = ((avg_gain * D(period - 1)) + gain) / period_decimal
        avg_loss = ((avg_loss * D(period - 1)) + loss) / period_decimal
        points[index]["rsi"] = _wilder_rsi(avg_gain, avg_loss)


def _evaluate_regime(
    config: StrategyConfig,
    *,
    completed_week_rsi: Decimal | None,
) -> str:
    if completed_week_rsi is None:
        return DEFAULT_REGIME_LABEL
    if completed_week_rsi >= config.regime_bull_mid_low_threshold:
        return ATTACK_REGIME_LABEL
    if completed_week_rsi <= config.regime_bear_mid_high_threshold:
        return DEFENSE_REGIME_LABEL
    return DEFAULT_REGIME_LABEL


def build_regime_context(
    primary_bars: list[MarketBar],
    config: StrategyConfig,
    *,
    regime_bars: list[MarketBar] | None = None,
    regime_data_hash: str | None = None,
) -> ResolvedRegimeContext:
    if not primary_bars:
        raise ValueError("No primary bars provided")
    config_hash = config.regime_config_hash()
    if not regime_feature_enabled(config):
        base_parameters = disabled_regime_parameters(config)
        return ResolvedRegimeContext(
            enabled=False,
            symbol=config.regime_symbol,
            data_hash=None,
            config_hash=config_hash,
            session_parameters_by_date={
                bar.session_date: base_parameters
                for bar in primary_bars
            },
        )
    if not regime_bars:
        raise ValueError("Regime-enabled SOXL runs require QQQ regime bars")

    weekly_points = _weekly_close_points(regime_bars)
    _apply_weekly_rsi(weekly_points, config.regime_rsi_period_weeks)
    completed_points = [
        point
        for point in weekly_points
        if point["rsi"] is not None
    ]

    primary_weeks: "OrderedDict[date, list[date]]" = OrderedDict()
    for bar in sorted(primary_bars, key=lambda item: item.session_date):
        primary_weeks.setdefault(_week_start(bar.session_date), []).append(bar.session_date)

    completed_index = 0
    session_parameters: dict[date, SessionRegimeParameters] = {}
    for week_start, session_dates in primary_weeks.items():
        while completed_index < len(completed_points) and completed_points[completed_index]["week_end"] < week_start:
            completed_index += 1
        completed_week_rsi: Decimal | None = None
        if completed_index >= 1:
            completed_week_rsi = D(completed_points[completed_index - 1]["rsi"])
        current_regime = _evaluate_regime(
            config,
            completed_week_rsi=completed_week_rsi,
        )
        parameters = _parameters_for_regime(
            config,
            current_regime,
            completed_week_rsi=completed_week_rsi,
        )
        for session_date in session_dates:
            session_parameters[session_date] = parameters

    return ResolvedRegimeContext(
        enabled=True,
        symbol=config.regime_symbol,
        data_hash=regime_data_hash,
        config_hash=config_hash,
        session_parameters_by_date=session_parameters,
    )


def load_regime_context(primary_bars: list[MarketBar], config: StrategyConfig) -> ResolvedRegimeContext:
    if not regime_feature_enabled(config):
        return build_regime_context(primary_bars, config)
    csv_path = Path(config.regime_csv_path or default_market_data_csv(config.regime_symbol))
    if not csv_path.exists():
        raise FileNotFoundError(f"Regime CSV not found: {csv_path}")
    regime_bars = normalize_bars(CsvMarketDataProvider(csv_path).load_bars(config.regime_symbol))
    return build_regime_context(
        primary_bars,
        config,
        regime_bars=regime_bars,
        regime_data_hash=compute_data_hash(regime_bars),
    )
