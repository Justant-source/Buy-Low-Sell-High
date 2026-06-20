from __future__ import annotations

from typing import Protocol

from ...domain.models import MarketBar


class MarketDataProvider(Protocol):
    def load_bars(self, symbol: str) -> list[MarketBar]:
        ...

