# 백테스트 방법론

Phase 0에서는 가드레일만 정의한다.

- 결정성은 필수다.
- 단위 테스트와 레퍼런스 테스트는 네트워크에 의존하면 안 된다.
- 데이터 불일치는 parity 주장 자체를 막아야 한다.
- 레퍼런스 parity 검사는 짧은 샘플 fixture가 아니라 표준 로컬 SOXL 스냅샷 기준으로 실행해야 한다.
- `DATA_MISMATCH`, `FAIL`, `NOT_APPLICABLE`를 보고하는 parity 명령은 반드시 non-zero로 종료해야 한다.
