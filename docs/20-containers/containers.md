# 컨테이너

- `postgres`: 시장 데이터, 백테스트, 작업, 수동 장부를 저장하는 런타임 저장소
- `engine-worker`: Compose에는 남아 있지만 `scripts/docker_init.sh`에서는 시작하지 않는 Phase 5 스모크 테스트 서비스
- `engine-cli`: SOXL 동기화와 백테스트에 사용하는 온디맨드 Python CLI 컨테이너
- `dashboard`: `/monitor`, `/backtests`, `/manual`을 제공하는 TypeScript Express API 및 정적 UI 호스트

Redis는 의도적으로 제외한다.

컨테이너 이름은 반드시 `soxlmania-` 접두사를 사용해야 한다. 일회성 헬퍼 컨테이너는 `soxlmania-engine-sync`, `soxlmania-engine-backtest` 같은 명시적 이름을 사용한다.

로컬 Docker 스크립트는 `docker` CLI와 `/var/run/docker.sock`를 통한 daemon 접근이 모두 필요하다.
