# ADR 0002: 조정 가능한 진입/청산 임계값 오버라이드

## 상태
승인됨

## 배경
이제 대시보드 워크벤치는 사용자가 선택한 `thread_count`, `stop_sessions`, 익절 임계값, 진입 하락 임계값, 가격 손절, 사이징 모드, 가격 기준으로 멘토 전략을 실행할 수 있어야 한다. 이 값들은 결정성을 유지해야 하며, `config_hash`에 포함되어야 하고, 백테스트 실행 경로 사이에서 조용히 어긋나면 안 된다.

## 결정
- `thread_count` 기본값은 `7`이다.
- `take_profit_pct`는 `entry_price * (1 + pct / 100)`로 해석한다.
- `take_profit_operator=gt`는 엄격한 `>`를 뜻하며, `price == entry_price`는 익절이 아니라는 기존 기준 규칙을 유지한다.
- `take_profit_operator=gte`는 `>=`를 뜻하며, opt-in일 때만 사용한다.
- `entry_drop_pct`는 `previous_price * (1 - pct / 100)`로 해석하고, 진입 비교는 여전히 엄격한 `<`를 사용한다.
- `stop_loss_pct=0`이면 가격 손절을 완전히 비활성화한다.
- `stop_loss_pct > 0`일 때 `price <= entry_price * (1 - pct / 100)`이면 `CloseReason.PRICE_STOP`으로 청산한다.
- `profit_precedes_stop=true`이면 여러 청산 조건이 동시에 참일 때 가격 손절과 시간 손절보다 익절을 우선한다.
- parity 리포트와 대시보드 요약에서는 기존 `time_stop_count` 집계 안에 `PRICE_STOP`을 포함해, 별도의 손절 열을 추가하지 않고도 총 손절 수가 일관되게 보이도록 한다.
- 동일한 임계값 로직은 `run_strategy()`와 각 리포트 빌더가 공유하는 실행 경로에서 일관되게 적용되어야 한다.

## 결과
- 서로 다른 임계값 설정은 서로 다른 `config_hash`와 별도의 대시보드 캐시 키를 만든다.
- `take_profit_pct=0`, `entry_drop_pct=0`, `stop_loss_pct=0`, `take_profit_operator=gt`, `max_entries_per_session=1`일 때 기존 기본 동작은 유지된다.
- 거래 내보내기에서는 `PRICE_STOP`과 `TIME_STOP`을 구분할 수 있지만, 집계 손절 수는 기존 표와 parity 검사와의 호환성을 유지한다.
