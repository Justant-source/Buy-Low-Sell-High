# ADR 0003: Official Yahoo Research Baseline

## 상태
승인됨

## 배경
멘토 전사 fixture는 유용한 비교 자료지만, 현재 확보된 SOXL 데이터셋과 완전한 parity를 만들 수 없었다. 멘토 기준에 제품 전체를 묶어두면 CI가 계속 외부 데이터 불일치에 종속되고, 우리 연구 환경을 안정적으로 개선하기 어렵다.

동시에 현재 저장소에는 다음이 이미 존재한다.

- Yahoo chart 기반 표준 스냅샷 `data/raw/soxl_daily_2011_present.csv`
- Yahoo chunk cache `data/snapshots/yahoo_chart/`
- snapshot manifest writer
- 코어 9조합 전략 탐색기와 canonical segment ranking

따라서 제품 차원의 공식 기준선은 멘토 parity가 아니라, 저장소가 직접 재현 가능한 Yahoo 연구 baseline으로 고정한다.

## 결정
공식 연구 baseline은 다음으로 정의한다.

- 데이터 스냅샷: `data/raw/soxl_daily_2011_present.csv`
- 데이터 소스: Yahoo chart sync
- 가격 기준: `price_basis=adjusted_close`
- 실행 모델: `execution_model=ideal_same_close`
- 사이징 모드: `sizing_mode=fixed_principal`
- 공식 프로필: `configs/strategies/ddeolsao_pal_official_v1.yaml`

공식 프로필 선택 방식:

- 후보군: 코어 9조합 `5x10`부터 `7x40`
- 정렬 기준: `mean_segment_return desc`, `segment_stddev asc`, `full_return desc`
- 현재 표준 Yahoo 스냅샷에서 선택된 조합: `5x40`
- 공식 profile id: `ddeolsao_pal_official_v1`

2026-06-20 기준 고정 메타데이터:

- 현재 표준 스냅샷 `data_hash`: `9c6ca09d2c091a40280f715ca81051d993e0b7803faafc2bb1d92642f74f77d9`
- 공식 golden fixture:
  - `engine/tests/fixtures/official_reference_matrix.json`
  - `engine/tests/fixtures/official_explorer_summary.json`

품질 게이트:

- `official-reference-check`가 공식 제품 CI gate다.
- `bootstrap-check`와 `ci`는 이 golden 비교를 통과해야 한다.
- 멘토 parity와 `mentor_floor`는 `legacy comparison` 진단으로만 남기고 CI gate에서 제외한다.

## 결과
- 대시보드 기본 프로필은 `ddeolsao_pal_official_v1`가 된다.
- `/api/backtests/official-explorer`와 `/api/backtests/official-matrix`가 공식 canonical 리포트 경로가 된다.
- 멘토 매트릭스와 관련 ADR은 계속 보존하지만, 제품 성공/실패 판정 기준은 아니다.
- 이후 공식 baseline을 바꾸려면 새 snapshot hash, 새 golden fixture, 새 ADR 근거가 함께 필요하다.
