from __future__ import annotations

from ..domain.enums import RecommendationAction
from ..domain.models import MarketBar, Recommendation, StrategyConfig
from ..strategies.ddeolsao_pal import recommend_actions


def build_recommendations(
    bars: list[MarketBar],
    config: StrategyConfig,
    open_positions: dict[int, tuple[object, int]],
) -> list[Recommendation]:
    results: list[Recommendation] = []
    tuples = recommend_actions(bars, config, open_positions)
    if not bars:
        return results
    latest = bars[-1]
    price = latest.price_for_basis(config.price_basis)
    for thread_id, action, reason in tuples:
        results.append(
            Recommendation(
                thread_id=thread_id,
                action=RecommendationAction(action),
                reason=reason,
                basis_price=price,
                session_date=latest.session_date,
            )
        )
    return results

