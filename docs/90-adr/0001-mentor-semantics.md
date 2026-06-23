# ADR 0001: 멘토 의미론 기준선

## 상태
기준선으로 승인되었으며, 멘토 화면 세부 사항은 ADR 0002에서 보정한다.

## 배경
멘토 시트 레퍼런스는 전사되어 있지만, 정확한 과거 데이터 소스와 모든 엣지 케이스 스위치는 아직 parity로 입증되지 않았다.
동시에 같은 전략 의미론을 `SOXL`, `TQQQ`, `KORU`, `0193T0`, `233740`, `462330` workspace 전반에 재사용해야 한다.

## 결정
실행 가능한 기준 의미론으로 `mentor_v1`을 사용한다.

- `close < previous_close`일 때 진입
- 세션당 신규 스레드 최대 1개
- 기본 순서는 청산 후 진입
- `current_close > entry_price`이면 익절
- `holding_sessions >= stop_sessions`이고 가격이 회복되지 않았으면 시간 손절
- 동일 세션 내 스레드 재사용은 기본 허용
- 기본 스레드 선택 기준은 `round_robin`
- 기본 연구용 가격 기준은 adjusted close
- `ideal_same_close`는 실전 기대값이 아니라 연구용 parity 모델로만 허용

2026-06-21 기준 구현 검증 결과:

- `sizing_mode=fixed_principal`는 신규 진입 때마다 초기 스레드 원금을 사용한다.
- `sizing_mode=thread_compound`는 다음 진입에 각 스레드의 현재 free equity를 사용한다.
- `sizing_mode=portfolio_rebalance_compound`는 `total_equity / thread_count`를 사용한다.
- `year_boundary`는 설정에는 존재하지만 현재 엔진은 아직 이를 소비하지 않는다. 따라서 상위 리포트가 데이터를 직접 분할하지 않는 한 런타임 동작은 carry-only다.
- 기본 `end_of_test`는 `mark_to_market`이며, `force_close`는 마지막 세션에만 opt-in으로 적용된다.

## 결과
- 엔진은 현재 시점에서 결정적이며 테스트 가능하다.
- 같은 의미론을 `official_reference`와 `backtest_only` workspace에도 재사용하지만, 멘토 parity 주장 자체는 계속 SOXL `legacy comparison`에 한정한다.
- 연도 리셋 의미론에 의존하는 멘토 레퍼런스 화면 동작은 코어 런타임 지원이 들어오기 전까지 ADR 0002에서 별도로 문서화한다.
- 향후 parity 보정 과정에서 모호한 스위치가 바뀔 수는 있지만, 그런 변경은 침묵 속에 적용하지 말고 반드시 이 ADR에 기록해야 한다.
