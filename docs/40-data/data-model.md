# 데이터 모델

현재 저장소가 다루는 범위는 다음과 같다.

- 버전 관리되는 SOXL 시세 바는 Python 객체로 표현되며 CSV fixture에서 적재된다.
- 표준 로컬 SOXL 스냅샷 경로는 `data/raw/soxl_daily_2011_present.csv`이며, `2011-01-01` 이후 데이터로 채워진다.
- 네트워크 동기화는 Yahoo, Investing, Stooq를 소스로 사용할 수 있으며, 동시에 백테스트용 버전 관리 CSV 스냅샷을 유지한다.
- 기본 연구용 가격 기준으로는 `adj_close`가 필요하다. 동기화된 스냅샷이 전체 구간에서 `close`를 그대로 `adj_close`에 복제했다면, 적재 요약에서 adjusted-close parity를 지원할 수 없다는 경고가 나와야 한다.
- `db/migrations/0001_initial.sql`에 PostgreSQL 마이그레이션 스켈레톤이 존재한다.
- 수동 체결 기록은 시뮬레이션 백테스트와 분리되어야 한다.
- 모든 백테스트 실행은 이미 `config_hash`와 `data_hash`를 계산한다.
- 고정된 멘토 레퍼런스 화면 fixture는 `engine/tests/fixtures/mentor_reference_matrix.yaml`에 위치한다.
- 멘토 매트릭스는 두 가지 결과 계열을 구분한다.
  - 연도별 매트릭스 행과 연도별 카운트 행에 사용하는 연도 독립 실행
  - 단리/복리 집계 행에 사용하는 연속 carry 실행
- 멘토 매트릭스에서:
  - `simple`은 `sizing_mode=fixed_principal`에 대응한다.
  - `compound`는 `sizing_mode=thread_compound`에 대응한다.
- 멘토 매트릭스 윈도는 다음과 같다.
  - `total`: 2011-2024
  - `y5`: 2020-2024
  - `y3`: 2022-2024
  - `y1`: 2024
- 권위 있는 멘토 화면은 고정 fixture에서 렌더될 수 있지만, 런타임 parity가 `DATA_MISMATCH`인 동안 이것은 parity 주장으로 간주되지 않는다.
- 현재 대시보드의 멘토 매트릭스는 런타임 `actual` 백테스트 값을 기본으로 사용하며, 고정된 멘토 전사값은 비교용 메타데이터로만 남아 있다.
