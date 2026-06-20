# 백테스트 방법론

- 결정성은 필수다.
- 단위 테스트와 레퍼런스 테스트는 네트워크에 의존하면 안 된다.
- 모든 연구 실행과 golden fixture는 `config_hash`, `data_hash`, `code_commit`를 함께 남겨야 한다.
- 공식 제품 게이트는 `official_reference_matrix.json`과 `official_explorer_summary.json`에 대한 exact golden 비교다.
- 공식 기준선은 `data/raw/soxl_daily_2011_present.csv` Yahoo 스냅샷, `price_basis=adjusted_close`, `execution_model=ideal_same_close`, `sizing_mode=fixed_principal`을 사용한다.
- 공식 기본 프로필은 `ddeolsao_pal_official_v1`이며, 현재 코어 9조합 중 `5x40`을 채택한다.
- 공식 프로필 선정 기준은 `mean_segment_return desc`, `segment_stddev asc`, `full_return desc`다.
- `official-explorer`와 `official-matrix`는 위 공식 기준선을 재현하는 canonical 리포트다.
- `Strategy Explorer`와 `Sweep Explorer`의 일반 연구 경로는 계속 유지하되, 기본 스윕 평가는 `execution_model=next_open`, `price_basis=adjusted_close`를 사용한다.
- `next_open`, `next_close`, 비용 민감도, 갭 리스크 리포트는 현실 비교용이며 공식 채택 게이트가 아니다.
- 멘토 parity와 `mentor_floor`는 `legacy comparison` 진단으로만 유지한다.
- `mentor_floor` 기본 허용치는 멘토 대비 `-5.0` 퍼센트포인트지만, CI 실패 조건이 아니라 수동 triage 정보다.
- `data_hash`가 다르면 멘토 parity를 `PASS`라고 주장하지 않는다.
- Bit-Mania 참조는 계속 유지한다. 구현과 UI 검토 시 `/home/justant/Data/Bit-Mania/backtest/dashboards/strategy_dashboard.html`과 `/home/justant/Data/Bit-Mania/backtest/dashboards/supertrend_sweep_dashboard.html`을 명시적으로 확인한다.
