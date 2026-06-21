from __future__ import annotations

from datetime import UTC, date, datetime
import re
import urllib.request

from ...domain.models import MarketBar
from ...domain.money import D


class NaverMarketDataProvider:
    _USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/137.0.0.0 Safari/537.36"
    )

    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def load_bars(
        self,
        symbol: str,
        *,
        start_date: str = "2011-01-01",
        end_date: str | None = None,
    ) -> list[MarketBar]:
        first_page = self._fetch_page(symbol, 1)
        last_page = self._parse_last_page(first_page)
        pages = [first_page]
        for page in range(2, last_page + 1):
            pages.append(self._fetch_page(symbol, page))
        bars: list[MarketBar] = []
        for page_html in pages:
            bars.extend(self._parse_page_rows(symbol, page_html))
        start_value = date.fromisoformat(start_date)
        end_value = date.fromisoformat(end_date) if end_date else None
        unique_by_date: dict[date, MarketBar] = {}
        for bar in bars:
            if bar.session_date < start_value:
                continue
            if end_value is not None and bar.session_date > end_value:
                continue
            unique_by_date[bar.session_date] = bar
        return [unique_by_date[session_date] for session_date in sorted(unique_by_date)]

    def _fetch_page(self, symbol: str, page: int) -> str:
        url = f"https://finance.naver.com/item/sise_day.naver?code={symbol}&page={page}"
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": f"https://finance.naver.com/item/main.naver?code={symbol}",
                "User-Agent": self._USER_AGENT,
            },
        )
        with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
            return response.read().decode("euc-kr", "replace")

    def _parse_last_page(self, html: str) -> int:
        last_page_match = re.search(r'class="pgRR">.*?page=(\d+)', html, flags=re.S)
        if last_page_match:
            return int(last_page_match.group(1))
        page_links = [int(value) for value in re.findall(r"page=(\d+)", html)]
        return max(page_links, default=1)

    def _parse_page_rows(self, symbol: str, html: str) -> list[MarketBar]:
        rows: list[MarketBar] = []
        for chunk in re.split(r"<tr[^>]*>", html):
            date_match = re.search(r'gray03">(\d{4}\.\d{2}\.\d{2})<', chunk)
            if not date_match:
                continue
            values = re.findall(r'<span class="tah p11(?: [^"]*)?">\s*([\d,]+)\s*</span>', chunk)
            if len(values) < 6:
                continue
            session_date = datetime.strptime(date_match.group(1), "%Y.%m.%d").replace(tzinfo=UTC).date()
            close = D(values[0].replace(",", ""))
            open_ = D(values[2].replace(",", ""))
            high = D(values[3].replace(",", ""))
            low = D(values[4].replace(",", ""))
            volume = int(values[5].replace(",", ""))
            rows.append(
                MarketBar(
                    symbol=symbol,
                    session_date=session_date,
                    open=open_,
                    high=high,
                    low=low,
                    close=close,
                    adj_close=close,
                    volume=volume,
                    source="naver",
                )
            )
        return rows
