from __future__ import annotations

from datetime import datetime
import hashlib
import http.cookiejar
import re
import urllib.parse
import urllib.request

from ...domain.models import MarketBar
from ...domain.money import D


class StooqMarketDataProvider:
    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def load_bars(
        self,
        symbol: str,
        *,
        start_date: str = "2011-01-01",
        end_date: str | None = None,
    ) -> list[MarketBar]:
        stooq_symbol = f"{symbol.lower()}.us"
        opener, html = self._fetch_history_page(stooq_symbol, start_date=start_date, end_date=end_date)
        if self._is_challenge_page(html):
            self._solve_challenge(opener, html, stooq_symbol)
            _, html = self._fetch_history_page(
                stooq_symbol,
                opener=opener,
                start_date=start_date,
                end_date=end_date,
            )
        last_page = self._parse_last_page(html)
        bars = self._parse_history_html(symbol, html)
        for page in range(2, last_page + 1):
            _, page_html = self._fetch_history_page(
                stooq_symbol,
                opener=opener,
                start_date=start_date,
                end_date=end_date,
                page=page,
            )
            bars.extend(self._parse_history_html(symbol, page_html))
        return bars

    def _fetch_history_page(
        self,
        stooq_symbol: str,
        *,
        opener: urllib.request.OpenerDirector | None = None,
        start_date: str = "2011-01-01",
        end_date: str | None = None,
        page: int = 1,
    ) -> tuple[urllib.request.OpenerDirector, str]:
        query_params = {
            "s": stooq_symbol,
            "i": "d",
        }
        if page > 1:
            query_params["l"] = str(page)
        query = urllib.parse.urlencode(query_params)
        url = f"https://stooq.com/q/d/?{query}"
        client = opener or urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with client.open(request, timeout=self.timeout_seconds) as response:
            return client, response.read().decode("utf-8")

    def _is_challenge_page(self, text: str) -> bool:
        return 'const c="' in text and "crypto.subtle.digest" in text

    def _solve_challenge(self, opener: urllib.request.OpenerDirector, html: str, stooq_symbol: str) -> None:
        match = re.search(r'const c="([^"]+)",d=(\d+)', html)
        if match is None:
            raise RuntimeError("Stooq verification challenge missing payload")
        challenge = match.group(1)
        difficulty = int(match.group(2))
        prefix = "0" * difficulty
        nonce = 0
        while True:
            digest = hashlib.sha256(f"{challenge}{nonce}".encode("utf-8")).hexdigest()
            if digest.startswith(prefix):
                break
            nonce += 1
        body = urllib.parse.urlencode({"c": challenge, "n": nonce}).encode("utf-8")
        request = urllib.request.Request(
            "https://stooq.com/__verify",
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": "https://stooq.com",
                "Referer": f"https://stooq.com/q/d/?s={stooq_symbol}&i=d",
                "User-Agent": "Mozilla/5.0",
            },
            method="POST",
        )
        with opener.open(request, timeout=self.timeout_seconds) as response:
            if response.read().decode("utf-8").strip().lower() != "ok":
                raise RuntimeError("Stooq verification challenge failed")

    def _parse_history_html(self, symbol: str, html: str) -> list[MarketBar]:
        rows = re.findall(
            (
                r"<tr><td[^>]*>\d+</td><td nowrap>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td>"
                r"<td>([^<]+)</td><td>([^<]+)</td><td[^>]*>[^<]+</td><td[^>]*>[^<]+</td><td>([^<]+)</td></tr>"
            ),
            html,
        )
        if not rows:
            raise RuntimeError("Stooq history page did not contain price rows")
        bars: list[MarketBar] = []
        for session_text, open_, high, low, close, volume in rows:
            bars.append(
                MarketBar(
                    symbol=symbol,
                    session_date=datetime.strptime(session_text, "%d %b %Y").date(),
                    open=D(open_),
                    high=D(high),
                    low=D(low),
                    close=D(close),
                    adj_close=D(close),
                    volume=int(volume.replace(",", "")),
                    source="stooq",
                )
            )
        return bars

    def _parse_last_page(self, html: str) -> int:
        matches = re.findall(r"&l=(\d+)>>>", html)
        if not matches:
            return 1
        return max(int(value) for value in matches)
