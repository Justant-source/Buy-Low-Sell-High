# 컴포넌트

- `engine`: 전략, 백테스트, 파리티, 데이터 동기화 로직
- `dashboard`: Express REST API, 파일 기반 대시보드 작업, PostgreSQL-backed research artifacts, Bit-Mania 스타일 정적 UI 페이지
  - `/backtests/:symbolSlug`는 워크스페이스 단위 백테스트 화면을 제공한다.
  - 기본 SOXL 워크스페이스는 `설명`, `Strategy Explorer`, `Sweep Explorer`, 상세 실행, 비교 매트릭스, 멘토 매트릭스, 리스크 비교를 함께 노출한다.
  - 다른 종목 워크스페이스는 동일 템플릿을 재사용하되 SOXL 전용 reference 탭은 숨긴다.
  - `설명` 탭은 SOXL 떨사오팔을 처음 보는 사용자를 위한 입문 설명과, 현재 기본 익절(`take_profit_pct=0`) 및 향후 QQQ 레짐 기반 익절 파라미터 계획을 안내한다.
  - 전략 탭 상단은 KPI 묶음 대신 `기간 설정` 카드를 사용하며, `시작일 / 종료일 / 구간 적용`과 그 아래의 기간 프리셋을 한 섹션에 배치한다.
  - `Thread Timeline`은 `thread-scroll-panel` 하단의 viewport bar를 제공하며, 가운데를 드래그해 이동하고 양 끝 핸들을 드래그해 프리미어 프로 스타일로 확대/축소한다. 짧은 구간도 전체 보기와 세부 보기 사이를 넓은 범위로 오갈 수 있어야 한다.
  - `Thread Timeline` 바로 아래에는 현재 Focus 전략과 선택 구간의 거래 이력을 row 단위로 보여주는 paginated table이 있어야 하며, page size 기본값은 20이다.
  - UI와 방법론 검토는 계속 `/home/justant/Data/Bit-Mania` 아래의 reference dashboard 2종을 기준으로 한다.
- `scripts`: 저장소 가드레일과 문서 검증 스크립트
- `docs`: 아키텍처와 정책의 단일 진실 원본
