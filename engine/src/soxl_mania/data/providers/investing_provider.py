from __future__ import annotations

from datetime import datetime
import http.cookiejar
import json
import urllib.parse
import urllib.request

from ...domain.models import MarketBar
from ...domain.money import D


class InvestingMarketDataProvider:
    _USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/137.0.0.0 Safari/537.36"
    )
    _PAGE_URLS = {
        "SOXL": "https://www.investing.com/etfs/direxion-dly-semiconductor-bull-3x-historical-data",
    }
    _INSTRUMENT_IDS = {
        "SOXL": "45073",
    }

    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def load_bars(
        self,
        symbol: str,
        *,
        start_date: str = "2011-01-01",
        end_date: str | None = None,
    ) -> list[MarketBar]:
        instrument_id = self._INSTRUMENT_IDS.get(symbol.upper())
        page_url = self._PAGE_URLS.get(symbol.upper())
        if instrument_id is None or page_url is None:
            raise ValueError(f"Investing provider does not have instrument metadata for {symbol}")
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self._prime_session(opener, page_url)
        payload = self._fetch_payload(opener, instrument_id, page_url, start_date, end_date)
        return self._parse_payload(symbol, payload)

    def _prime_session(self, opener: urllib.request.OpenerDirector, page_url: str) -> None:
        request = urllib.request.Request(
            page_url,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "max-age=0",
                "Sec-CH-UA": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
                "User-Agent": self._USER_AGENT,
            },
        )
        with opener.open(request, timeout=self.timeout_seconds) as response:
            response.read()

    def _fetch_payload(
        self,
        opener: urllib.request.OpenerDirector,
        instrument_id: str,
        page_url: str,
        start_date: str,
        end_date: str | None,
    ) -> dict[str, object]:
        end_value = end_date or datetime.utcnow().date().isoformat()
        query = urllib.parse.urlencode(
            {
                "start-date": start_date,
                "end-date": end_value,
                "time-frame": "Daily",
                "add-missing-rows": "false",
            }
        )
        url = f"https://api.investing.com/api/financialdata/historical/{instrument_id}?{query}"
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Content-Type": "application/json",
                "Origin": "https://www.investing.com",
                "Referer": page_url,
                "Sec-CH-UA": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": '"Windows"',
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-site",
                "User-Agent": self._USER_AGENT,
                "domain-id": "www",
                "priority": "u=1, i",
            },
        )
        with opener.open(request, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))

    def _parse_payload(self, symbol: str, payload: dict[str, object]) -> list[MarketBar]:
        rows = payload.get("data")
        if not isinstance(rows, list) or not rows:
            raise RuntimeError("Investing payload did not contain historical rows")
        bars: list[MarketBar] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            session_date = datetime.fromisoformat(str(row["rowDateTimestamp"]).replace("Z", "+00:00")).date()
            volume = int(row["volumeRaw"])
            if session_date.weekday() >= 5 and volume == 0:
                continue
            bars.append(
                MarketBar(
                    symbol=symbol,
                    session_date=session_date,
                    open=D(row["last_openRaw"]),
                    high=D(row["last_maxRaw"]),
                    low=D(row["last_minRaw"]),
                    close=D(row["last_closeRaw"]),
                    adj_close=D(row["last_closeRaw"]),
                    volume=volume,
                    source="investing",
                )
            )
        return bars
