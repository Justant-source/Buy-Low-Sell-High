# REST API

대시보드 API는 `dashboard/src/server.ts`의 Express 앱이 제공하며, 실행 경계로 Python CLI를 사용한다. 연구 실행 결과를 나타내는 응답에는 `config_hash`, `data_hash`, `code_commit` 같은 재현성 메타데이터가 포함된다.

## 상태 확인
- `GET /api/health`
  - 대시보드 프로세스 상태, phase 라벨, 업타임 초를 반환한다.

## 데이터
- `GET /api/data/status`
  - `workspaceId` 또는 `symbol`/`csvPath` 기준으로 `symbol`, `rows`, `start`, `end`, `data_hash`, `source`, `warnings`, `snapshot_path`, `manifest_path`를 반환한다.

## 워크스페이스
- `GET /api/workspaces`
  - `defaultWorkspaceId`와 좌측 백테스트 내비게이션에 쓰는 workspace 목록을 반환한다.

## 프로필
- `GET /api/profiles`
  - `workspaceId` 기준 hydrated 전략 프로필과 `defaultProfileId`를 반환한다.
- `GET /api/profiles/:profileId`
  - `configHash`, `initialCapital`을 포함한 단일 hydrated 프로필을 반환한다.

## 백테스트
- `GET /api/backtests`
  - 최근 작업, 경량 실행 요약, 최신 전체 실행 산출물을 반환한다.
- `GET /api/backtests/strategy-explorer`
  - `/home/justant/Data/Bit-Mania/backtest/dashboards/strategy_dashboard.html`을 계속 참조하는 고정 `core_profiles_v1` 9전략 비교 payload를 반환한다.
  - 기본 실행 모델은 `next_open`, 기본 가격 기준은 `adjusted_close`다.
  - 전체 기간 canonical 실행을 전략별로 1회만 수행한 뒤 일별 곡선, 연도별 요약, 월별 수익, 구간별 요약을 반환한다.
- `GET /api/backtests/official-explorer`
  - 공식 Yahoo 연구 기준선의 9조합 랭킹 payload를 반환한다.
  - 기준 프로필은 `soxl_official_ddeolsao_pal_v1`, 실행 모델은 `ideal_same_close`, 가격 기준은 `adjusted_close`다.
- `GET /api/backtests/official-matrix`
  - 공식 Yahoo 연구 기준선의 연간 수익률, 단리/복리 집계, 카운트, 선택 프로필 메타데이터를 포함한 canonical matrix payload를 반환한다.
- `GET /api/backtests/thread-timeline`
  - 전략 탭의 `focus` 콤보 1개에 대한 swimlane/Gantt payload를 반환한다.
  - `lanes`, `sessions`, `summary`를 포함하며, 세션 상태는 `end-of-session` 기준이다.
  - `entry_batch`는 Total 레인의 매수 상세 drill-down 원본이며 `Thread`, `배정 자본금`, `진입 날짜`, `진입 가격`, `진입 수량`을 보여줄 수 있는 필드를 담는다.
  - `exit_batch`는 Total 레인의 당일 매도 수 drill-down 원본이며 thread별 `익절 상세`/`손절 상세`, `return`, `holding_sessions`, 합산 PnL 표시를 지원한다.
  - `open_positions`는 세션 종료 시점에 살아 있는 thread만 담는다.
- `POST /api/backtests/jobs`
  - 단일 상세 백테스트 실행을 위한 대기열 작업을 생성한다.
- `GET /api/backtests/jobs/:jobId`
  - 완료 시 `runId`를 포함한 작업 상태, 타임스탬프, 진행률을 반환한다.
- `GET /api/backtests/runs/:runId`
  - 지표, 연도 표, 일별 시계열, 거래 내역을 포함한 저장된 전체 실행 산출물을 반환한다.
- `GET /api/backtests/runs/:runId/trades.csv`
  - 저장된 거래 내역을 CSV로 내보낸다.
- `GET /api/backtests/compare`
  - 선택한 프로필과 데이터셋에 대한 9셀 thread/stop 비교 매트릭스 payload를 반환한다.
- `GET /api/backtests/mentor-matrix`
  - `meta`, 런타임 `actual` 백테스트 값, 비교용 고정 `reference` 값, parity 상태를 포함한 멘토 매트릭스 payload를 반환한다.
  - 이 경로는 `legacy comparison` 전용이며 제품 CI 게이트가 아니다.
- `GET /api/backtests/risk`
  - `ideal_same_close`, `next_open`, `next_close`를 비교하는 리스크 리포트와 비용 민감도, 회복 기간, 레버리지 ETF 경고 문구를 반환한다.
- `POST /api/backtests/sweeps/jobs`
  - `/home/justant/Data/Bit-Mania/backtest/dashboards/supertrend_sweep_dashboard.html`을 계속 참조하는 `core6_v1` 파라미터 스윕 작업을 생성한다.
  - 작업 종류는 `BACKTEST_SWEEP`이며, 결과는 PostgreSQL 연구 산출물로 저장된다.
- `GET /api/backtests/sweeps/jobs/:jobId`
  - sweep 작업 상태와 완료 시 `artifactId`를 반환한다.
- `GET /api/backtests/sweeps/latest`
  - 동일 `csv_path`, `execution_model`, `price_basis`, `data_hash`, `sweep_id` 조합의 최신 sweep 산출물을 반환한다.
- `GET /api/backtests/sweeps/runs/:artifactId`
  - `combo_count`, Pareto 플래그, 구간 강건성 지표, 상위 100개 콤보용 정렬 가능한 row 목록을 포함한 저장된 sweep 산출물을 반환한다.
