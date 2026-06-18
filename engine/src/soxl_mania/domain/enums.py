from __future__ import annotations

from enum import Enum


class ThreadState(str, Enum):
    FREE = "FREE"
    OPEN = "OPEN"


class ExecutionModel(str, Enum):
    IDEAL_SAME_CLOSE = "ideal_same_close"
    NEXT_OPEN = "next_open"
    NEXT_CLOSE = "next_close"
    MANUAL_FILL = "manual_fill"


class PriceBasis(str, Enum):
    ADJUSTED_CLOSE = "adjusted_close"
    RAW_CLOSE_WITH_ACTIONS = "raw_close_with_actions"


class CloseReason(str, Enum):
    TAKE_PROFIT = "TAKE_PROFIT"
    TIME_STOP = "TIME_STOP"
    END_OF_TEST = "END_OF_TEST"


class ThreadSelector(str, Enum):
    ROUND_ROBIN = "round_robin"
    LOWEST_ID = "lowest_id"
    OLDEST_FREE = "oldest_free"


class EventOrder(str, Enum):
    EXITS_THEN_ENTRY = "exits_then_entry"
    ENTRY_THEN_EXITS = "entry_then_exits"


class YearBoundary(str, Enum):
    CARRY = "carry"
    RESET = "reset"
    FORCE_CLOSE = "force_close"


class EndOfTestMode(str, Enum):
    MARK_TO_MARKET = "mark_to_market"
    FORCE_CLOSE = "force_close"


class SizingMode(str, Enum):
    FIXED_PRINCIPAL = "fixed_principal"
    THREAD_COMPOUND = "thread_compound"
    PORTFOLIO_REBALANCE_COMPOUND = "portfolio_rebalance_compound"


class RecommendationAction(str, Enum):
    BUY = "BUY"
    TAKE_PROFIT = "TAKE_PROFIT"
    TIME_STOP = "TIME_STOP"
    HOLD = "HOLD"
    NO_ACTION = "NO_ACTION"

