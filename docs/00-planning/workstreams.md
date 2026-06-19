# 워크스트림

이 저장소는 구현 계획에서 파생된 8개의 병렬 워크스트림 기준으로 구성되어 있다.

## 현재 작업 분해
1. 기반: 저장소 규칙, 문서 SSOT, CI, 안전 검증
2. 데이터: SOXL EOD 데이터 적재, 매니페스트, 거래소 세션 캘린더
3. 전략: 자본 스레드 도메인 모델과 결정적 상태 머신
4. 백테스트: 실행 모델, 지표, 연도별 요약, 스윕
5. 파리티: 멘토 레퍼런스 fixture, 리포트, 의미론 보정 ADR
6. 영속성: PostgreSQL 스키마, 작업, 워커, 캐시, 재현성
7. 대시보드: REST API, 비교 매트릭스, 내보내기, 최신성 표시
8. 수동 운용: 권고, 장부, 되돌리기, 리스크 및 릴리스 강화

## 전달 규칙
- 이후 작업을 병렬화하기 전에 `Phase 0`를 완전히 구현해야 한다.
- 이후 모든 커밋은 하나의 `Phase Gate` 범위 안에만 머물러야 한다.

## 현재 상태
- 워크스트림 `1-5`는 이 저장소 안에서 실행 가능한 Python 스캐폴딩과 테스트를 갖추고 있다.
- 워크스트림 `6`은 스모크 및 결정성 테스트용 인메모리 worker/repository와 스키마 SQL을 갖추고 있다.
- 워크스트림 `7-8`은 Express 대시보드, Bit-Mania 스타일 다중 페이지 UI, CLI 기반 API, 파일 기반 대시보드 작업 산출물을 포함한다.
- 로컬 TypeScript 검증은 `npm --prefix dashboard run build` 와 `npm --prefix dashboard test`로 실행 가능하다.
- 로컬 대시보드 스모크 플로우는 `make e2e-backtest`, `make e2e-manual`, `make e2e-risk`로 실행 가능하다.
- Phase 8 리스크 리포트는 `make scenario-report` 와 `make e2e-risk` 경로를 통해 로컬 실행 가능하다.
- Phase 9 백업 및 종합 게이트는 `make backup`, `make backup-restore-test`, `make clean-room`, `make ci`로 실행 가능하다.
- 현재 환경에서는 Docker CLI를 설치할 수 있지만, snap 세션이 `/var/run/docker.sock`에 접근하지 못하면 Docker 기반 검증은 여전히 막힐 수 있다.
- 멘토 레퍼런스 매트릭스 작업은 현재 다음을 포함한다.
  - 고정된 fixture와 ADR 0002
  - `reference`, `actual`, `parity` 섹션을 포함하는 `backtest mentor-matrix` CLI 출력
  - 캐시된 대시보드 렌더링을 포함한 `GET /api/backtests/mentor-matrix`
  - 현재 로컬 adjusted-close 스냅샷이 권위 있는 멘토 원본 데이터와 다르기 때문에 명시적 `DATA_MISMATCH` 보고
