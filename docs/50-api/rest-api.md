# REST API

대시보드 API는 `dashboard/src/server.ts`의 Express 앱이 제공하며, 실행 경계로 Python CLI를 사용한다. 연구 실행 결과를 나타내는 응답에는 `config_hash`, `data_hash`, `code_commit` 같은 재현성 메타데이터가 포함된다. 연구 산출물 저장소는 우선순위대로 `DATABASE_URL`의 PostgreSQL, `SQLITE_PATH`의 SQLite 파일, 마지막으로 in-memory fallback을 사용한다.

## 상태 확인
- `GET /api/health`
  - 대시보드 프로세스 상태, phase 라벨, 업타임 초를 반환한다.

## 데이터
- `GET /api/data/status`
  - `workspaceId` 또는 `symbol`/`csvPath` 기준으로 `symbol`, `rows`, `start`, `end`, `data_hash`, `source`, `warnings`, `snapshot_path`, `manifest_path`를 반환한다.

## 워크스페이스
- `GET /api/workspaces`
  - `defaultWorkspaceId`와 좌측 백테스트 내비게이션에 쓰는 workspace 목록을 반환한다.
  - 현재 `soxl`, `tqqq`, `0193t0`, `233740`, `462330`를 반환한다.
  - `soxl`은 `referenceMode=mentor_reference`, `tqqq`는 `referenceMode=official_reference`, `0193t0`/`233740`/`462330`는 `referenceMode=backtest_only`다.

## 프로필
- `GET /api/profiles`
  - `workspaceId` 기준 hydrated 전략 프로필과 `defaultProfileId`를 반환한다.
- `GET /api/profiles/:profileId`
  - `configHash`, `initialCapital`을 포함한 단일 hydrated 프로필을 반환한다.

## 백테스트
- `GET /api/backtests`
  - 최근 작업, 경량 실행 요약, 최신 전체 실행 산출물을 반환한다.
- `GET /api/backtests/strategy-explorer`
  - `/home/justant/Data/Bit-Mania/backtest/dashboards/strategy_dashboard.html`을 계속 참조하는 고정 `core_profiles_v2` 6전략 비교 payload를 반환한다.
  - 기본 실행 모델과 가격 기준은 선택된 프로필/워크스페이스 메타데이터를 따른다.
  - `SOXL` 기본값은 `ideal_same_close` + `adjusted_close`다.
  - `TQQQ` 기본값도 `ideal_same_close` + `adjusted_close`다.
  - `0193T0`, `233740`, `462330` 기본값은 `ideal_same_close` + `raw_close_with_actions`다.
  - 전체 기간 canonical 실행을 전략별로 1회만 수행한 뒤 일별 곡선, 연도별 요약, 월별 수익, 구간별 요약을 반환한다.
  - 응답에는 `benchmark`(`Buy & Hold`) 일별 시계열이 포함되며, 대시보드는 이를 전략 비교용 pseudo row로 재사용한다.
  - 응답에는 모든 워크스페이스가 공통으로 쓰는 `rankings`와 `meta.ranking_basis`가 포함되며, `콤보 랭킹` 박스는 이 payload만으로 렌더링할 수 있어야 한다.
  - 대시보드의 `기간 설정`이 바뀌면 `콤보 랭킹` 박스는 이 payload의 `daily`와 `segment_presets`를 사용해 선택 slice 기준 지표를 클라이언트에서 다시 계산한다.
  - UI 랭킹 표시는 `full_return_pct`, `cagr_pct`, `max_drawdown_pct`를 사용한다.
  - UI 랭킹 정렬은 선택 slice의 `cagr_pct desc`, `max_drawdown_pct desc`, `full_return_pct desc`를 사용한다.
  - `Buy & Hold` row는 UI에서 항상 최상단에 고정되며 선택은 가능하지만 `Focus` 대상은 아니다.
- `GET /api/backtests/strategy-ranking`
  - 전략 탭 `콤보 랭킹` 전용 4파라미터 ranking payload를 반환한다.
  - 전체 기간은 최신 `core4_v4` sweep artifact를 재사용한다.
  - 수동 slice는 `sliceStart`, `sliceEnd`, `executionModel`, `priceBasis` 기준으로 `STRATEGY_RANKING` 연구 아티팩트와 서버 메모리 캐시를 재사용한다.
  - 캐시 미스 수동 slice 계산은 상주 Python daemon이 처리하며, daemon 내부의 `8-worker` 프로세스풀이 최대 `1시간` idle까지 유지된다.
  - `기간 프리셋` 구간은 서버 시작 직후 선계산해 저장하고, 프리셋 버튼 클릭은 저장된 랭킹 payload를 로드하는 경로를 우선 사용한다.
  - `limit=0`이면 전체 combo rows를 반환하고, 현재 대시보드의 `콤보 랭킹` 박스는 이 전체 rows에 대해 클라이언트에서 페이지네이션, 정렬, 4파라미터 필터를 적용한다.
  - `Buy & Hold`는 API row가 아니라 UI pseudo row이며, 항상 최상단에 고정되고 `Focus` 대상은 아니다.
- `GET /api/backtests/strategy-detail`
  - 선택된 4파라미터 콤보 1개의 일별 equity, 월별, 구간 요약 payload를 반환한다.
  - 동일 `strategyId`/데이터셋/실행모델 조합은 서버 메모리 캐시로 재사용한다.
- `GET /api/backtests/official-explorer`
  - 공식 Yahoo 연구 기준선의 6조합 랭킹 payload를 반환한다.
  - 기준 프로필은 해당 official-reference workspace의 default profile이며, 현재 `soxl_official_ddeolsao_pal_v1`와 `tqqq_official_ddeolsao_pal_v1`를 사용한다.
  - 실행 모델은 `ideal_same_close`, 가격 기준은 `adjusted_close`다.
  - 이 경로는 현재 `soxl`, `tqqq` workspace에서 의미가 있다.
  - `tqqq`는 SOXL와 달리 별도 golden fixture/parity 비교를 요구하지 않는다.
- `GET /api/backtests/official-matrix`
  - 공식 Yahoo 연구 기준선의 연간 수익률, 단리/복리 집계, 카운트, 선택 프로필 메타데이터를 포함한 canonical matrix payload를 반환한다.
  - 이 경로는 현재 `soxl`, `tqqq` workspace에서 의미가 있다.
- `GET /api/backtests/thread-timeline`
  - 전략 탭의 `focus` 콤보 1개에 대한 swimlane/Gantt payload를 반환한다.
  - `lanes`, `sessions`, `summary`를 포함하며, 세션 상태는 `end-of-session` 기준이다.
  - `entry_batch`는 Total 레인의 매수 상세 drill-down 원본이며 `Thread`, `배정 자본금`, `진입 날짜`, `진입 가격`, `진입 수량`을 보여줄 수 있는 필드를 담는다.
  - `exit_batch`는 Total 레인의 당일 매도 수 drill-down 원본이며 thread별 `익절 상세`/`손절 상세`, `return`, `holding_sessions`, 합산 PnL 표시를 지원한다.
  - `open_positions`는 세션 종료 시점에 살아 있는 thread만 담는다.
  - 동일 `strategyId`/데이터셋/실행모델 조합은 서버 메모리 캐시를 사용한다.
- `POST /api/backtests/jobs`
  - 단일 상세 백테스트 실행을 위한 대기열 작업을 생성한다.
- `GET /api/backtests/jobs/:jobId`
  - 완료 시 `runId`를 포함한 작업 상태, 타임스탬프, 진행률을 반환한다.
- `GET /api/backtests/runs/:runId`
  - 지표, 연도 표, 일별 시계열, 거래 내역을 포함한 저장된 전체 실행 산출물을 반환한다.
- `GET /api/backtests/runs/:runId/trades.csv`
  - 저장된 거래 내역을 CSV로 내보낸다.
- `GET /api/backtests/compare`
  - 선택한 프로필과 데이터셋에 대한 thread/stop 비교 매트릭스 payload를 반환한다.
- `GET /api/backtests/mentor-matrix`
  - `meta`, 런타임 `actual` 백테스트 값, 비교용 고정 `reference` 값, parity 상태를 포함한 멘토 매트릭스 payload를 반환한다.
  - 이 경로는 `legacy comparison` 전용이며 제품 CI 게이트가 아니다.
  - 이 경로는 현재 `soxl` workspace에서만 의미가 있다.
- `GET /api/backtests/risk`
  - `ideal_same_close`, `next_open`, `next_close`를 비교하는 리스크 리포트와 비용 민감도, 회복 기간, 레버리지 ETF 경고 문구를 반환한다.
- `POST /api/backtests/sweeps/jobs`
  - `/home/justant/Data/Bit-Mania/backtest/dashboards/supertrend_sweep_dashboard.html`을 계속 참조하는 `core4_v4` 파라미터 스윕 작업을 생성한다.
  - 현재 sweep 정의는 `thread_count[5,6,7] × stop_sessions[30,40] × buy_pct[-10..0] × sell_pct[0..10]`로 총 726조합이다.
  - 작업 종류는 `BACKTEST_SWEEP`이며, 결과는 PostgreSQL 연구 산출물로 저장된다.
- `GET /api/data/status?workspaceId=0193t0`
  - `0193T0` synthetic pre-listing 경고와 canonical snapshot 경로를 함께 반환한다.
- `GET /api/data/status?workspaceId=tqqq`
  - `TQQQ` Yahoo canonical snapshot 경로와 source metadata를 반환한다.
- `GET /api/data/status?workspaceId=233740`
  - `233740` Naver canonical snapshot 경로와 source metadata를 반환한다.
- `GET /api/data/status?workspaceId=462330`
  - `462330` Naver canonical snapshot 경로와 source metadata를 반환한다.
- `GET /api/backtests/sweeps/jobs/:jobId`
  - sweep 작업 상태와 완료 시 `artifactId`를 반환한다.
- `GET /api/backtests/sweeps/latest`
  - 동일 `csv_path`, `execution_model`, `price_basis`, `data_hash`, `sweep_id` 조합의 최신 sweep 산출물을 반환한다.
- `GET /api/backtests/sweeps/runs/:artifactId`
  - `combo_count`, Pareto 플래그, 구간 강건성 지표, 정렬 가능한 row 목록을 포함한 저장된 sweep 산출물을 반환한다.
  - 대시보드의 현재 주요 비교 컬럼은 `full_return_pct`, `cagr_pct`, `max_drawdown_pct`다.
  - 대시보드의 `파라미터 테스트` 표는 이 row 목록 중 상위 10개만 렌더링한다.
