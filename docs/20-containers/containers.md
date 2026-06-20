# 컨테이너

- `postgres`: 시장 데이터, 백테스트, 작업, 연구 산출물을 저장하는 런타임 저장소
- `engine-worker`: Compose에는 남아 있지만 `scripts/docker_init.sh`에서는 시작하지 않는 Phase 5 스모크 테스트 서비스
- `engine-cli`: 종목 데이터 동기화와 백테스트에 사용하는 온디맨드 Python CLI 컨테이너
- `dashboard`: `/backtests/:symbolSlug`를 제공하는 TypeScript Express API 및 정적 UI 호스트
  - `DATABASE_URL`을 사용해 `backtest_research_artifacts`, `backtest_research_sweep_rows`를 PostgreSQL에 저장한다.
  - `Strategy Explorer`와 `Sweep Explorer`는 이 저장소를 사용해 재현성 메타데이터가 포함된 연구 산출물을 재사용한다.

Redis는 의도적으로 제외한다.

컨테이너 이름은 반드시 `buylowsellhigh-` 접두사를 사용해야 한다. 일회성 헬퍼 컨테이너는 `buylowsellhigh-engine-sync`, `buylowsellhigh-engine-backtest` 같은 명시적 이름을 사용한다.

로컬 Docker 스크립트는 `docker` CLI와 `/var/run/docker.sock`를 통한 daemon 접근이 모두 필요하다.
