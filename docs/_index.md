# 문서 인덱스

## 현재 구현 스냅샷
- 현재 워크스페이스는 `SOXL`, `TQQQ`, `KORU`, `0193T0`, `233740`, `462330`다.
- `referenceMode`는 `soxl=mentor_reference`, `tqqq/koru=official_reference`, `0193t0/233740/462330=backtest_only`다.
- 공식 연구 기준선 계열은 `Yahoo adjusted_close + ideal_same_close + fixed_principal`을 사용하며, 현재 `SOXL`, `TQQQ`, `KORU`에 적용된다.
- 저장된 `Strategy Explorer`, `Strategy Ranking`, `Sweep` 산출물은 `code_commit`이 현재 코드 fingerprint와 일치할 때만 재사용한다.
- slice 전략 랭킹은 `cagr desc, max_drawdown desc, full_return desc`를 사용한다.
- 종료 자산이 `0` 이하인 slice에서는 CAGR을 정의하지 않고 총수익률을 대체 표시한다.
- 전략 탭에서 선택 구간을 바꾸면 `콤보 랭킹`, `Rebased Equity`, `월별`, `롤링`, `Thread Timeline`은 모두 같은 slice 바 집합으로 다시 실행한 결과를 사용한다.
- 대시보드 startup preset warmup은 best-effort이며 실패를 로그로 격리해야 한다.

## 권한 순서
1. 런타임 코드
2. `docs/70-policy/*.md`
3. `docs/10-context` 부터 `docs/60-runtime` 까지
4. 계획 문서

## 권장 읽기 순서
1. `docs/70-policy/strategy.md`
2. `docs/90-adr/0003-official-research-baseline.md`
3. `docs/70-policy/mentor-vs-implemented-strategy.md`
4. `docs/10-context/system-context.md`
5. `docs/20-containers/containers.md`
6. `docs/30-components/components.md`
7. `docs/40-data/data-model.md`
8. `docs/50-api/rest-api.md`
9. `docs/60-runtime/state-machines.md`
10. `docs/00-planning/workstreams.md`
11. `docs/90-adr/0001-mentor-semantics.md`
12. `docs/90-adr/0002-mentor-reference-screen.md`
13. `docs/90-adr/0002-tunable-threshold-overrides.md`
14. `docs/90-adr/0004-backtest-only-workspaces.md`
15. `docs/90-adr/0005-idle-cash-and-official-baseline-refresh.md`
16. `docs/90-adr/0006-0193t0-synthetic-prelisting-history.md`

## Phase 매핑
- `Phase 0`: `docs/00-planning/workstreams.md`, `docs/70-policy/strategy.md`
- `Phase 1`: `docs/40-data/data-model.md`, `docs/70-policy/backtest-methodology.md`
- `Phase 2`: `docs/60-runtime/state-machines.md`, `docs/70-policy/strategy.md`
- `Phase 3`: `docs/50-api/rest-api.md`, `docs/70-policy/backtest-methodology.md`
- `Phase 4`: `docs/90-adr/0000-clean-room-bootstrap.md`
- `Phase 5`: `docs/40-data/data-model.md`, `docs/20-containers/containers.md`
- `Phase 6-9`: 해당 API, 정책, 컴포넌트 문서
