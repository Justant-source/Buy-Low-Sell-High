# ADR 0004: 백테스트 전용 다종목 워크스페이스 전환

## 상태
승인됨

## 배경
기존 제품은 SOXL 단일종목 연구와 수동 장부를 함께 포함하고 있었다. 새 제품은 백테스트 전용으로 축소하고, SOXL 화면을 공통 템플릿으로 삼아 다른 종목을 같은 구조로 추가할 수 있어야 한다.

## 결정
- 제품명은 `Buy-Low-Sell-High`로 통일한다.
- 대시보드는 `/backtests/:symbolSlug` 기반 workspace 라우팅으로 전환한다.
- `시스템 모니터`, `수동 장부`, `manual` CLI/API/백업 기능은 제거한다.
- SOXL만 공식/멘토 reference 탭을 유지한다.
- 종목 기본 데이터 경로는 `data/raw/{symbol_lower}_daily_2011_present.csv` 규칙을 사용한다.

## 결과
- 코드 경계가 백테스트 전용으로 단순해진다.
- 새 종목 추가는 workspace 정의와 전략 프로필 추가로 제한된다.
- SOXL reference parity 자산은 유지되지만 다른 종목으로 강제 확장하지 않는다.
