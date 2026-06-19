# REST API

대시보드 API는 `dashboard/src/server.ts`의 Express 앱이 제공하며, 실행 경계로 Python CLI를 사용한다. 연구 실행 결과를 나타내는 응답에는 `config_hash`, `data_hash`, `code_commit` 같은 재현성 메타데이터가 포함된다.

## 상태 확인
- `GET /api/health`
  - 대시보드 프로세스 상태, phase 라벨, 업타임 초를 반환한다.

## 데이터
- `GET /api/data/status`
  - `symbol`, `rows`, `start`, `end`, `data_hash`, `source`, `warnings`, `snapshot_path`를 반환한다.

## 프로필
- `GET /api/profiles`
  - 대시보드가 사용하는 hydrated 전략 프로필과 `defaultProfileId`를 반환한다.
- `GET /api/profiles/:profileId`
  - `configHash`, `initialCapital`을 포함한 단일 hydrated 프로필을 반환한다.

## 백테스트
- `GET /api/backtests`
  - 최근 작업, 경량 실행 요약, 최신 전체 실행 산출물을 반환한다.
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
- `GET /api/backtests/risk`
  - `ideal_same_close`, `next_open`, `next_close`를 비교하는 리스크 리포트와 비용 민감도, 회복 기간, 레버리지 ETF 경고 문구를 반환한다.

## 수동 운용
- `GET /api/manual/comparison`
  - 오늘의 권고와 append-only 수동 체결을 매칭한 결과를 반환하며, 대기 상태와 기준가 대비 실제 체결가 차이를 포함한다.
- `GET /api/manual/ledger`
  - 선택한 프로필 장부 경로와 요약, 이슈, 스레드 상태, 체결 이력을 반환한다.
- `GET /api/manual/threads`
  - 선택한 프로필 장부 경로와 스레드 요약, 현재 스레드 상태를 반환한다.
- `GET /api/manual/history`
  - 선택한 프로필 장부 경로와 append-only 체결 이력을 반환한다.
- `GET /api/manual/today`
  - 선택한 프로필 장부 경로와 오늘의 권고를 반환한다.
- `POST /api/manual/reconcile`
  - 현재 append-only 장부에 대한 정합성 이슈와 선택한 프로필 장부 경로를 반환한다.
- `POST /api/manual/fills`
  - 장부에 수동 체결을 추가한다.
- `POST /api/manual/fills/:fillId/reverse`
  - 되돌리기 체결을 추가하고 원본 체결과 연결한다.
- `GET /api/manual/export`
  - 선택한 프로필 장부를 복원 가능한 JSON 또는 체결 이력 CSV로 `format=json|csv` 기준 내보낸다.
- `POST /api/manual/restore`
  - 내보낸 JSON payload에서 선택한 프로필 장부를 복원한다. 명시적 확인 토큰 `RESTORE_MANUAL_LEDGER`가 필요하다.
