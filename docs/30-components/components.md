# 컴포넌트

- `engine`: 전략, 백테스트, 파리티, 데이터 동기화, 수동 권고 및 장부 로직
- `dashboard`: Express REST API, 파일 기반 대시보드 작업, PostgreSQL-backed research artifacts, Bit-Mania 스타일 정적 UI 페이지
  - `/backtests`는 `Strategy Explorer`, `Sweep Explorer`, 상세 실행, 비교 매트릭스, 멘토 매트릭스, 리스크 비교를 함께 노출한다.
  - UI와 방법론 검토는 계속 `/home/justant/Data/Bit-Mania` 아래의 reference dashboard 2종을 기준으로 한다.
- `scripts`: 저장소 가드레일과 문서 검증 스크립트
- `docs`: 아키텍처와 정책의 단일 진실 원본
