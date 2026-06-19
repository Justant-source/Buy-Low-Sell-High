# 백테스트 방법론

- 결정성은 필수다.
- 단위 테스트와 레퍼런스 테스트는 네트워크에 의존하면 안 된다.
- 데이터 불일치는 parity 주장 자체를 막아야 한다.
- 레퍼런스 parity 검사는 짧은 샘플 fixture가 아니라 표준 로컬 SOXL 스냅샷 기준으로 실행해야 한다.
- `DATA_MISMATCH`, `FAIL`, `NOT_APPLICABLE`를 보고하는 parity 명령은 반드시 non-zero로 종료해야 한다.
- Bit-Mania 참조는 계속 유지한다. 구현과 UI 검토 시 `/home/justant/Data/Bit-Mania/backtest/dashboards/strategy_dashboard.html`과 `/home/justant/Data/Bit-Mania/backtest/dashboards/supertrend_sweep_dashboard.html`을 명시적으로 확인한다.
- `Strategy Explorer`는 고정 `core_profiles_v1` 9개 전략(`5x10`부터 `7x40`)에 대해 전체 기간 canonical 실행을 1회씩 계산한다.
- 구간 조회는 canonical 전체 실행의 slice를 재기준화해서 보여주며, slice 시작점부터 재백테스트하지 않는다.
- `Sweep Explorer`는 고정 `core6_v1` 파라미터 조합에 대해 전체 기간 백테스트를 수행한다.
- 기본 스윕 평가는 `execution_model=next_open`, `price_basis=adjusted_close`다. `ideal_same_close`는 비교 연구용이며 기본 순위 근거가 아니다.
- 과적합 검토는 단일 전체 기간 수익률이 아니라 `mean_segment_return`, `segment_stddev`, `worst_segment_return`, `positive_segment_ratio`, `recent_segment_return`, Pareto 플래그를 함께 본다.
- 기본 정렬은 `mean_segment_return desc`, `segment_stddev asc`, `full_return desc`다.
