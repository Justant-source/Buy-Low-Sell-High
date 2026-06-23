# ADR 0004: 백테스트 전용 다종목 워크스페이스 전환

## 상태
승인됨

## 배경
기존 제품은 SOXL 단일종목 연구와 수동 장부를 함께 포함하고 있었다. 새 제품은 백테스트 전용으로 축소하고, SOXL 화면을 공통 템플릿으로 삼아 다른 종목을 같은 구조로 추가할 수 있어야 한다.
하지만 모든 종목에 SOXL용 reference 자산을 강제할 수는 없기 때문에, workspace마다 다른 reference mode를 둘 필요가 생겼다.

## 결정
- 제품명은 `Buy-Low-Sell-High`로 통일한다.
- 대시보드는 `/backtests/:symbolSlug` 기반 workspace 라우팅으로 전환한다.
- `시스템 모니터`, `수동 장부`, `manual` CLI/API/백업 기능은 제거한다.
- workspace는 `referenceMode`를 가진다.
  - `SOXL = mentor_reference`
  - `TQQQ = official_reference`
  - `KORU = official_reference`
  - `0193T0`, `233740`, `462330 = backtest_only`
- `mentor_reference`는 official baseline과 legacy mentor comparison을 함께 보여준다.
- `official_reference`는 official baseline만 보여주고 mentor legacy card는 숨긴다.
- `backtest_only`는 4번째 reference 탭을 숨긴다.
- 종목 기본 데이터 경로는 하드코딩 규칙이 아니라 심볼 레지스트리가 결정한다.

## 결과
- 코드 경계가 백테스트 전용으로 단순해진다.
- 새 종목 추가는 workspace 정의, 전략 프로필, 심볼 레지스트리, 데이터 소스 결정, reference mode 선택으로 제한된다.
- SOXL reference parity 자산은 유지되지만 다른 종목으로 강제 확장하지 않는다.
- TQQQ, KORU처럼 official baseline만 필요한 종목은 mentor parity 자산 없이도 같은 제품 셸에 합류할 수 있다.
