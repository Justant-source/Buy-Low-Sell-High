# 상태 머신

Python 엔진은 결정적인 `FREE -> OPEN -> FREE` 자본 스레드 생명주기를 구현한다.

현재 런타임 상태 머신:

- `FREE`
- `OPEN`

청산 사유는 `TAKE_PROFIT`, `PRICE_STOP`, `TIME_STOP`, `END_OF_TEST`를 사용한다. 기본 종료 모드는 `mark_to_market`이며, `year_boundary`는 현재 코어 엔진이 직접 소비하지 않는다.

워크스페이스와 대시보드 라우팅은 이 상태 머신을 읽기 전용으로 표시할 뿐, 별도의 주문 상태나 장부 상태를 만들지 않는다.

## 연구 아티팩트 수명주기

- `CACHE_MISS`
- `CLI_OR_DAEMON_EXECUTION`
- `PERSISTED_ARTIFACT`
- `MEMORY_CACHE_REUSE`

`Strategy Explorer`, `Strategy Ranking`, `Sweep`는 위 수명주기를 따라 재현성 메타데이터와 함께 저장/재사용된다.
`Strategy Detail`, `Thread Timeline`은 같은 cache-key 수명주기를 따르지만 현재는 서버 메모리 캐시만 사용한다.
저장된 연구 산출물은 `code_commit`이 현재 코드 fingerprint와 일치할 때만 재사용된다.

## Strategy Ranking Daemon 수명주기

- `COLD`
- `STARTED`
- `SERVING_REQUESTS`
- `IDLE_TIMER_RUNNING`
- `SHUTDOWN`

현재 daemon은 최대 `8-worker` 프로세스풀을 사용하고, `1시간` idle이면 종료될 수 있다.

## Preset Warmup 수명주기

- `QUEUED`
- `PRECOMPUTING`
- `STORED`
- `FAILED_LOGGED`

startup preset warmup은 best-effort다. 실패해도 대시보드 프로세스를 종료시키거나 `/api/health`를 실패로 만들지 않는다.
