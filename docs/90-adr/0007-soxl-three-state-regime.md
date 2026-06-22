# ADR 0007: SOXL Three-State RSI Regime

## 상태
승인됨

## 배경
기존 SOXL regime 로직은 bull / bear 전환 규칙이 복잡했고, 여러 RSI 조건과 방향 비교를 섞어 해석해야 했다. 이 구조는 설명과 검증이 어렵고, 상태 전환 자체보다 세부 트리거 최적화에 과하게 의존하기 쉬웠다.

또한 제품의 목적은 시장 레짐을 철학적으로 단정하는 것이 아니라, SOXL 떨사오팔의 공격/방어 파라미터를 재현 가능하게 전환하는 것이다.

## 결정
- SOXL regime은 `QQQ` 보조 시계열 기반 `3상태 상태머신`으로 고정한다.
- 상태 이름:
  - `neutral`
  - `attack`
  - `defense`
- 입력 데이터:
  - `QQQ` Yahoo 일봉
  - 주봉 종가 집계
  - `14-week Wilder RSI`
- 적용 타이밍:
  - 각 SOXL 세션은 `직전 완료 주`의 확정 RSI만 사용한다.
  - 진행 중인 현재 주의 RSI는 사용하지 않는다.
- 판정 규칙:
  - `RSI >= 55` → `attack`
  - `RSI <= 45` → `defense`
  - 그 사이 → `neutral`
- warmup:
  - 첫 RSI 계산 이전 구간은 `neutral`을 사용한다.
- 파라미터 매핑:
  - legacy `regime_base_*` = `neutral`
  - legacy `regime_bull_*` = `attack`
  - legacy `regime_bear_*` = `defense`
- legacy bull / bear threshold 입력은 호환용으로만 남기며, 런타임에서는 `55 / 45` 단일 경계값으로 정규화한다.
- 이미 열린 포지션은 진입 시점 regime 파라미터를 끝까지 유지한다.

## 결과
- regime 설명과 백테스트 검증이 단순해진다.
- `entry_regime`, `applied_regime`는 `attack / neutral / defense` 값을 사용한다.
- 대시보드와 API는 기존 bull / bear 필드명을 호환용으로 유지할 수 있지만, 사용자-facing 의미론은 `Attack / Defense / Neutral`로 설명한다.
