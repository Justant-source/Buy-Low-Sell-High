from __future__ import annotations

from datetime import date


class TradingCalendar:
    def __init__(self, sessions: list[date]) -> None:
        self._sessions = sessions
        self._session_to_index = {session: index for index, session in enumerate(sessions)}

    def session_index(self, session: date) -> int:
        return self._session_to_index[session]

    def is_weekend(self, session: date) -> bool:
        return session.weekday() >= 5

    def sessions(self) -> list[date]:
        return list(self._sessions)

