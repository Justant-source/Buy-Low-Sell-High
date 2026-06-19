# 떨사오팔 전략 SSOT

> **Single Source of Truth.** 백테스트 엔진, 대시보드, 수동 장부, parity 검증 모두 이 문서를 준거로 삼는다.
> 전략 의미론이 바뀌면 코드보다 이 문서를 먼저 갱신하고, 이 문서를 따라 코드를 수정한다.

---

## 1. 이름과 의미

**떨사오팔** = "떨어지면 사라, 오르면 팔아라"

- **떨** → 전일 대비 하락 시 진입 신호 발생
- **사** → 해당 세션에 매수
- **오** → 매수가보다 상승 시 익절 신호 발생
- **팔** → 해당 세션에 매도

SOXL(반도체 3배 레버리지 ETF) 일봉 데이터만 사용하며, 브로커 연동 없이 수동 결정 지원 목적으로만 운용한다.

---

## 2. 자본 구조 — 스레드 시스템

초기 자본 `initial_capital`을 `thread_count`개의 **독립 스레드**로 균등 분할한다.

```
thread_principal = initial_capital / thread_count
```

- 각 스레드는 독립적으로 매수/보유/청산을 처리한다.
- 스레드가 FREE 상태일 때만 신규 진입이 가능하다.
- **기본 진입 수:** 세션당 최대 1개 스레드 (`max_entries_per_session=1`)
- **스레드 재사용:** 같은 세션에 청산된 스레드를 즉시 재사용 허용 (`allow_same_session_thread_reuse=true`)
- **스레드 선택 기준:** 기본값은 LOWEST_ID (가장 낮은 번호 우선)

### 표준 스레드 구성

| 프로파일 | 스레드 수 | 손절 세션 |
|---|---|---|
| 5x10 | 5 | 10 |
| 5x30 | 5 | 30 |
| 5x40 | 5 | 40 |
| 6x10 | 6 | 10 |
| 6x30 | 6 | 30 |
| 6x40 | 6 | 40 |
| 7x10 | 7 | 10 |
| 7x30 | 7 | 30 |
| 7x40 | 7 | 40 |

멘토 매트릭스는 위 9개 조합을 모두 검증한다.

---

## 3. 매매 로직

### 3-1. 진입 신호 (Entry)

```
session_price < previous_price × (1 - entry_drop_pct / 100)
```

- **비교 연산자:** 엄격한 `<` (같으면 진입 안 함)
- **기본값:** `entry_drop_pct = 0` → 전일보다 단 1원이라도 낮으면 진입
- `entry_drop_pct = 5`이면 전일 대비 5% 초과 하락 시에만 진입

### 3-2. 익절 신호 (Take-Profit)

```
session_price > entry_price × (1 + take_profit_pct / 100)   [take_profit_operator=gt, 기본]
session_price >= entry_price × (1 + take_profit_pct / 100)  [take_profit_operator=gte]
```

- **기본값:** `take_profit_pct = 0`, `take_profit_operator = gt`
  → 매수가 초과 시 즉시 익절 (`price == entry_price`는 익절 아님)
- `take_profit_pct = 10`이면 매수가 대비 10% 초과 상승 시 익절

### 3-3. 시간 손절 (Time Stop)

```
holding_sessions >= stop_sessions  AND  session_price <= entry_price
```

- **보유 기간:** 달력일이 아니라 **거래소 세션(거래일)** 기준으로 계산
- 매수가보다 가격이 낮은 상태에서 보유 세션이 `stop_sessions`에 도달하면 청산
- 가격이 매수가보다 높으면 시간 손절이 발동하지 않는다

### 3-4. 가격 손절 (Price Stop)

```
session_price <= entry_price × (1 - stop_loss_pct / 100)
```

- **기본값:** `stop_loss_pct = 0` → 가격 손절 비활성화
- `stop_loss_pct = 20`이면 매수가 대비 20% 이하 하락 시 즉시 손절

### 3-5. 청산 우선순위

`profit_precedes_stop = true` (기본):

```
익절 > 가격 손절 > 시간 손절
```

같은 세션에서 여러 조건이 동시에 참이면 익절이 우선한다.

### 3-6. 이벤트 처리 순서

기본: `EXITS_THEN_ENTRY`

1. 열린 스레드 청산 처리 (익절 / 가격 손절 / 시간 손절)
2. 신규 진입 처리 (앞서 청산된 스레드 포함, 이번 세션 FREE 스레드 활용 가능)

---

## 4. 파라미터 전체 목록

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `thread_count` | 7 | 독립 자본 스레드 수 |
| `stop_sessions` | — | 시간 손절 세션 수 (필수 지정) |
| `initial_capital` | 10000 | 초기 자본 (USD) |
| `entry_drop_pct` | 0 | 진입 최소 하락률 (%) |
| `take_profit_pct` | 0 | 익절 최소 상승률 (%) |
| `take_profit_operator` | `gt` | 익절 비교 연산자 (`gt`=`>`, `gte`=`>=`) |
| `stop_loss_pct` | 0 | 가격 손절 하락률 (0이면 비활성) |
| `max_entries_per_session` | 1 | 세션당 최대 신규 진입 스레드 수 |
| `allow_same_session_thread_reuse` | true | 같은 세션 청산 스레드 즉시 재사용 허용 |
| `profit_precedes_stop` | true | 익절이 손절보다 우선 |
| `event_order` | `EXITS_THEN_ENTRY` | 청산→진입 순서 |
| `price_basis` | `adjusted_close` | 가격 기준 컬럼 |
| `execution_model` | `ideal_same_close` | 체결 모델 |
| `sizing_mode` | `fixed_principal` | 스레드 예산 계산 방식 |
| `year_boundary` | `carry` | 연도 경계 처리 (현재 엔진 미소비) |
| `thread_selector` | `LOWEST_ID` | 진입할 스레드 선택 방식 |
| `end_of_test` | `force_close` | 백테스트 종료 처리 |
| `commission_bps` | 0 | 수수료 (basis points) |
| `slippage_bps` | 0 | 슬리피지 (basis points) |

---

## 5. 사이징 모드

| 모드 | 설명 |
|---|---|
| `fixed_principal` | 매 진입마다 **초기 스레드 원금** 사용 (손익 무시) |
| `thread_compound` | 매 진입마다 **해당 스레드의 현재 free equity** 사용 (복리) |
| `portfolio_rebalance_compound` | 매 진입마다 **전체 포트폴리오 equity / thread_count** 사용 |

멘토 레퍼런스 화면 해석:
- Block C **단리(simple)** 집계 행 → `fixed_principal`
- Block C **복리(compound)** 집계 행 → `thread_compound`

---

## 6. 실행 모델

| 모델 | 설명 | 용도 |
|---|---|---|
| `ideal_same_close` | 신호 발생 당일 종가로 즉시 체결 | 연구용 parity 모델 (실전 기대값 아님) |
| `next_open` | 다음 거래일 시가로 체결 | 현실적 체결 시뮬레이션 |
| `next_close` | 다음 거래일 종가로 체결 | 현실적 체결 시뮬레이션 |
| `manual_fill` | 수동 장부 체결가만 사용 | 실제 수동 운용 기록 |

**주의:** `ideal_same_close`는 연구용 parity 검증에만 사용한다. 실제 수동 운용 결과와 비교할 때는 `manual_fill`을 사용한다.

---

## 7. 가격 기준

| 기준 | 컬럼 | 설명 |
|---|---|---|
| `adjusted_close` | `adj_close` | 기업행위(주식분할·배당) 반영 조정 종가 |
| `close` | `close` | 미조정 종가 |

멘토 레퍼런스는 `adjusted_close`를 사용한다.
현재 로컬 CSV 스냅샷은 `adj_close == close`이므로 실질적으로 조정 효과가 없다.

---

## 8. 멘토 레퍼런스 화면 구조

멘토 백테스트 이미지(`engine/tests/fixtures/mentor_reference_matrix.yaml`)는 두 개의 실행 계열을 혼합한다.

### 8-1. 연도 독립 계열 (Block B, D — 연도별 행)

- 각 연도를 **독립 실행**으로 처리 (`year_boundary = reset`)
- 초기 자본 **$10,000** 연도마다 리셋
- 9개 조합 × 14년(2011–2024)의 연간 수익률, 표준편차, 평균

### 8-2. 연속 carry 계열 (Block C — 집계 행)

- 윈도 전체를 **단일 연속 실행** (`year_boundary = carry`)
- 단리: `sizing_mode = fixed_principal`
- 복리: `sizing_mode = thread_compound`

| 윈도 | 기간 |
|---|---|
| `total` | 2011-01-01 ~ 2024-12-31 |
| `y5` | 2020-01-01 ~ 2024-12-31 |
| `y3` | 2022-01-01 ~ 2024-12-31 |
| `y1` | 2024-01-01 ~ 2024-12-31 |

### 8-3. 표준편차 정의

멘토 매트릭스의 `stddev`는 **연간 수익률 퍼센트의 표준편차** (모집단 표준편차).
일별 equity 수익률 표준편차와 다르다.

### 8-4. 허용 오차

| 항목 | 허용 오차 |
|---|---|
| 연간 수익률 셀 | ±0.1 %p |
| 집계 수익률 셀 | ±0.5 %p |
| 카운트 합계 행 | 정수 일치 |
| 카운트 평균 행 | ±0.5 |
| 연도 경계 가격 | ±0.01 (표시 반올림 노이즈) |

---

## 9. 현재 Parity 상태

| 항목 | 상태 |
|---|---|
| 전체 parity | `DATA_MISMATCH` |
| 로컬 data_hash | `87c5a8bd...668aca` |
| 첫 불일치 | 2022-12-30 연말 종가 (멘토: 9.36, 실제: 9.67) |
| 연간 수익률 불일치 수 | 123개 |
| 집계 통계 불일치 수 | 27개 |
| 복리 집계 불일치 | 수십조 배 격차 (의미론 차이) |

`DATA_MISMATCH` 상태에서는 parity `PASS`를 선언할 수 없다. 멘토 adjusted-close 데이터셋이 복구되기 전까지 대시보드는 런타임 실제값을 기본으로 표시하고 멘토 전사값은 비교 메타데이터로만 노출한다.

---

## 10. 신호 기준가와 실전 체결 규칙

### 10-1. 신호 기준가 — 종가(Close)

모든 진입·익절·손절 신호는 **당일 정규장 종가(adjusted close)**를 기준으로 판단한다.

```
진입 신호: session_close < previous_close × (1 - entry_drop_pct / 100)
익절 신호: session_close > entry_price × (1 + take_profit_pct / 100)
시간 손절: holding_sessions >= stop_sessions  AND  session_close <= entry_price
가격 손절: session_close <= entry_price × (1 - stop_loss_pct / 100)
```

### 10-2. 백테스트 체결 가정

백테스트(`ideal_same_close` 모델)에서는 **신호 발생 당일 종가에 지정가 체결이 된다고 가정**한다.
이는 연구용 parity 모델이며 실전 기대값이 아니다.

### 10-3. 실전 수동매매 규칙

종가 기준 신호와 실제 체결 사이의 시간 괴리를 다음 절차로 처리한다.

| 단계 | 행동 |
|---|---|
| **1. 종가 확정 후** | 정규장 종료 뒤 대시보드에서 당일 Thread별 신호 확인 |
| **2. 신호 확인** | 매수 / 익절 / 손절 신호 해당 Thread 식별 |
| **3. 애프터장 체결 (1순위)** | 애프터장 가격이 종가와 큰 차이 없으면 **지정가 주문 (종가 근방)** |
| **4. 다음 거래일 처리 (대안)** | 애프터장 괴리가 크거나 체결 미성사 → 다음 거래일 정규장 시초/초반 지정가로 처리 |
| **5. 체결가 수동 입력** | 실제 체결된 가격을 수동 장부에 반드시 입력 |

**핵심 원칙:**
- 신호는 종가 기준이지만, 체결은 애프터장 또는 다음 거래일 초반까지 허용한다.
- 시장가 주문을 사용하지 않는다. 항상 지정가로 원하는 가격을 명시한다.
- 체결 여부와 실제 체결가는 반드시 수동 입력한다. 자동 기록 없음.
- 다음 거래일 처리 시 그 사이 새로운 신호가 발생할 수 있다. 대시보드를 재확인한다.

### 10-4. 백테스트 vs 실전 괴리 인식

| 항목 | 백테스트 (`ideal_same_close`) | 실전 수동매매 |
|---|---|---|
| 신호 기준 | 당일 종가 | 당일 종가 (동일) |
| 체결 가정 | 당일 종가에 즉시 체결 | 애프터장 또는 익일 정규장 초반 |
| 체결가 | 종가 = 체결가 | 종가와 다를 수 있음 |
| 기록 방식 | 자동 계산 | 수동 입력 (`manual_fill`) |

백테스트 수익률과 실전 수익률의 차이는 이 괴리에서 발생한다. 이 차이를 줄이기 위해 가능한 한 종가 근방 지정가를 사용한다.

---

## 12. 백테스트가 반드시 따라야 할 규칙

1. **이 문서가 SSOT다.** 매매 로직, 파라미터 해석, 청산 우선순위는 모두 3절과 4절을 따른다.
2. **보유 기간은 거래소 세션(거래일) 기준이다.** 달력일 기준 계산 금지.
3. **결정론적 실행.** 동일 설정(`config_hash`) + 동일 데이터(`data_hash`) → 동일 결과. 난수·시각 의존 로직 금지.
4. **`ideal_same_close`는 연구용 parity 모델이다.** 실전 수익 예측에 사용하지 않는다.
5. **`entry_drop_pct = 0`은 전일보다 1원이라도 낮으면 진입이다.** 보합(same price)은 진입 아님.
6. **`take_profit_operator = gt` 기본값에서 `price == entry_price`는 익절 아님.**
7. **`stop_loss_pct = 0`이면 가격 손절 완전 비활성화.**
8. **연도 경계는 현재 엔진에서 `carry`다.** `year_boundary = reset` 지원 전까지 연도별 독립 실행은 호출부가 바를 잘라서 처리한다.
9. **`PRICE_STOP`은 집계 카운트에서 `TIME_STOP`과 합산 표시한다.** 별도 열 추가 금지 (parity 표 호환성).
10. **레퍼런스 fixture(`mentor_reference_matrix.yaml`)는 수정하지 않는다.** parity 불일치를 숨기기 위해 fixture를 바꾸는 행위는 레퍼런스 무결성 원칙 위반이다.

---

## 13. 관련 문서

| 문서 | 역할 |
|---|---|
| `docs/90-adr/0001-mentor-semantics.md` | 기준선 의미론 결정 (ADR) |
| `docs/90-adr/0002-mentor-reference-screen.md` | 멘토 화면 parity 의미론 (ADR) |
| `docs/90-adr/0002-tunable-threshold-overrides.md` | 진입/청산 임계값 오버라이드 (ADR) |
| `docs/70-policy/mentor-vs-implemented-strategy.md` | 멘토 vs 구현 갭 리포트 |
| `docs/70-policy/strategy.md` | 제품 경계 (브로커 연동 금지 등) |
| `engine/src/soxl_mania/strategies/ddeolsao_pal.py` | 전략 실행 코드 (구현체) |
| `engine/tests/fixtures/mentor_reference_matrix.yaml` | 멘토 레퍼런스 수치 fixture |
| `configs/strategies/` | 표준 프로파일 YAML |
