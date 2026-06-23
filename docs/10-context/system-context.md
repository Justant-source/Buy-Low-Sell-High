# 시스템 컨텍스트

Buy-Low-Sell-High는 종가 기준 일별 시장 데이터를 이용해 다종목 떨사오팔 전략을 백테스트하는 단일 운영자용 연구 시스템이다. 현재 워크스페이스는 `SOXL`, `TQQQ`, `KORU`, `0193T0`, `233740`, `462330`이며, 이후 종목도 동일한 `/backtests/:symbolSlug` 구조로 확장한다.

- `SOXL`은 `mentor_reference` 워크스페이스다. Yahoo 공식 기준선과 SOXL 전용 legacy mentor 비교를 함께 노출한다.
- `TQQQ`는 `official_reference` 워크스페이스다. Yahoo 공식 기준선은 제공하지만 SOXL형 mentor parity 자산은 강제하지 않는다.
- `KORU`는 `official_reference` 워크스페이스다. Yahoo 공식 기준선은 제공하지만 SOXL형 mentor parity 자산은 강제하지 않는다.
- `0193T0`, `233740`, `462330`는 `backtest_only` 워크스페이스다. 공식/멘토 참조 탭 없이 공통 연구 UI만 사용한다.
- 미국 레버리지 ETF(`SOXL`, `TQQQ`, `KORU`)는 Yahoo chart 기반 `adjusted_close` 스냅샷을 우선 사용하고, 국내 ETF/ETN 계열은 Naver 일별시세 기반 스냅샷을 사용한다.
- 대시보드는 startup 시 preset strategy-ranking artifact를 선계산할 수 있지만, 이 warmup은 best-effort이며 프로세스 생존성과 분리되어야 한다.
