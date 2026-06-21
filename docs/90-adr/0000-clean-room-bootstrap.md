# ADR 0000: 클린룸 부트스트랩

## 상태
승인됨

## 배경
원본 구현 계획은 실거래 코드, 비밀 정보, Redis, 브로커 커넥터를 제외한 새 저장소를 요구한다.

## 결정
Buy-Low-Sell-High를 PostgreSQL 전용 shared-store 클린룸 프로젝트로 부트스트랩하고, Python 엔진과 TypeScript 대시보드 스켈레톤을 둔다. 로컬 단일 사용자 대시보드에는 SQLite fallback을 허용하되, 소스 트리에 금지된 매매 코드나 Redis 패턴이 나타나면 실패하는 정적 검증을 추가한다.

- 대시보드 로컬 진입점은 `./scripts/dashboard_exec.sh build|test|start`로 통일한다.
- Python daemon subprocess와 preset warmup도 모두 백테스트 전용 연구 기능으로 한정한다.

## 결과
- Phase 0는 시장 데이터나 외부 서비스 없이 검증할 수 있다.
- 이후 Phase는 Bit-Mania 런타임 리스크를 상속하지 않고 명확한 경계 위에서 진행할 수 있다.
- 다종목 workspace와 research daemon을 추가해도 주문 제출, 브로커 SDK, Redis를 경계 밖에 유지할 수 있다.
