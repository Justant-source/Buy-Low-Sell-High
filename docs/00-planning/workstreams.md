# 워크스트림

이 저장소는 구현 계획에서 파생된 8개의 병렬 워크스트림 기준으로 구성되어 있다.

## 현재 작업 분해
1. 기반: 저장소 규칙, 문서 SSOT, CI, 안전 검증
2. 데이터: 종목별 EOD 데이터 적재, 매니페스트, 거래소 세션 캘린더
3. 전략: 자본 스레드 도메인 모델과 결정적 상태 머신
4. 백테스트: 실행 모델, 지표, 연도별 요약, 스윕
5. 파리티: 멘토 레퍼런스 fixture, 리포트, 의미론 보정 ADR
6. 영속성: PostgreSQL 스키마, 작업, 워커, 캐시, 재현성
7. 대시보드: workspace 라우팅, REST API, 비교 매트릭스, 최신성 표시
8. 리스크 및 릴리스 강화

## 전달 규칙
- 이후 작업을 병렬화하기 전에 `Phase 0`를 완전히 구현해야 한다.
- 이후 모든 커밋은 하나의 `Phase Gate` 범위 안에만 머물러야 한다.

## 현재 상태
- 워크스트림 `1-5`는 이 저장소 안에서 실행 가능한 Python 스캐폴딩과 테스트를 갖추고 있다.
- 워크스트림 `6`은 스모크 및 결정성 테스트용 인메모리 worker/repository와 스키마 SQL을 갖추고 있다.
- 워크스트림 `7-8`은 Express 대시보드, workspace 기반 UI, CLI 기반 API, 파일 기반 대시보드 작업 산출물, preset ranking warmup, Python strategy-ranking daemon 경로, slice-aware `strategy-detail`/`thread-timeline` 재실행 경로를 포함한다.
- 현재 workspace navigation은 `SOXL`, `TQQQ`, `KORU`, `0193T0`, `233740`, `462330`를 노출한다.
- 로컬 대시보드 TypeScript 검증은 `./scripts/dashboard_exec.sh build` 와 `./scripts/dashboard_exec.sh test`를 우선 사용한다.
- 로컬 대시보드 스모크 플로우는 `./scripts/e2e_backtest.sh`, `./scripts/e2e_risk.sh`로 실행 가능하다.
- Phase 8 리스크 리포트는 `PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli backtest risk-report --profile configs/strategies/soxl_official_ddeolsao_pal_v1.yaml --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL`로 직접 실행할 수 있다.
- Phase 9 종합 게이트는 직접 명령 기준 `python3 scripts/lint_docs.py`, `PYTHONPATH=engine/src python3 -m unittest discover -s engine/tests/unit -p 'test_*.py'`, `PYTHONPATH=engine/src python3 -m buy_low_sell_high.cli bootstrap-check`, `./scripts/dashboard_exec.sh test`, `./scripts/e2e_backtest.sh`, `./scripts/e2e_risk.sh`를 포함한다.
- `Makefile` alias는 유지되지만, 이 저장소 문서와 자동화는 `make`가 없는 환경도 허용해야 한다.
- 현재 환경에서는 Docker CLI를 설치할 수 있지만, snap 세션이 `/var/run/docker.sock`에 접근하지 못하면 Docker 기반 검증은 여전히 막힐 수 있다.
- 멘토 레퍼런스 매트릭스 작업은 현재 다음을 포함한다.
  - `official-explorer`, `official-matrix`, 공식 golden fixture, Yahoo snapshot manifest를 포함하는 제품 기준선
  - 고정된 fixture와 ADR 0002
  - `reference`, `actual`, `parity` 섹션을 포함하는 `backtest mentor-matrix` CLI 출력
  - 캐시된 대시보드 렌더링을 포함한 `GET /api/backtests/mentor-matrix`
  - 현재 로컬 adjusted-close 스냅샷이 권위 있는 멘토 원본 데이터와 다르기 때문에 명시적 `DATA_MISMATCH` 보고
