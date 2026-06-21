# 전략 정책

## 제품 경계
- 백테스트 전용 제품이다.
- 현재 기본 워크스페이스는 SOXL이며, `TQQQ`, `0193T0`, `233740`, `462330`가 같은 구조로 추가되어 있다.
- 이후 다른 종목도 동일한 workspace/프로필 공통 구조로 추가할 수 있어야 한다.
- 현재 reference 계층은 `soxl=mentor_reference`, `tqqq=official_reference`, `0193t0/233740/462330=backtest_only`다.
- 리서치, 파리티, 대시보드까지만 포함한다.
- 브로커 연동 금지
- 자동 주문 제출 금지
- Redis, Bybit, Telegram 매매 명령 금지

## 구현 원칙
- 보유 기간은 달력일이 아니라 거래소 세션 기준으로 계산한다.
- 레퍼런스 무결성을 지킨다. 불일치를 숨기기 위해 fixture를 수정하지 않는다.
- 공식 연구 기준선은 Yahoo `adjusted_close` 스냅샷과 `ideal_same_close` 실행 모델을 사용한다.
- checked-in 공식 제품 게이트는 현재 SOXL에 있고, TQQQ는 같은 의미론을 runtime canonical baseline으로만 사용한다.
- CAGR은 종료 자산이 0 이하인 구간에서는 수학적으로 정의되지 않으므로, 엔진은 해당 slice에서 총수익률을 대체 표시해 연구/대시보드 프로세스를 중단시키지 않는다.
- 대시보드 preset warmup 실패는 캐시 예열 실패일 뿐 프로세스 생존성 실패가 아니다. 실패는 로그로 격리해야 한다.
- 모든 백테스트 실행은 `config_hash`, `data_hash`, `code_commit`를 저장해야 한다.
- 저장된 연구 산출물은 `code_commit`이 현재 코드 fingerprint와 일치할 때만 재사용해야 한다.
- 전략 탭에서 선택 구간을 바꾸면 `콤보 랭킹`, `Rebased Equity`, `월별`, `롤링`, `Thread Timeline`은 모두 같은 slice 바 집합으로 다시 실행한 결과를 사용해야 한다.

## 현재 전략 참조 문서
- **전략 SSOT (매매 로직·파라미터·백테스트 준거)**: `docs/70-policy/ddeolsao-pal-ssot.md`
- **공식 연구 기준선 ADR**: `docs/90-adr/0003-official-research-baseline.md`
- 실행 가능한 기준 의미론: `docs/90-adr/0001-mentor-semantics.md`
- 멘토 화면 및 parity 의미론: `docs/90-adr/0002-mentor-reference-screen.md` (`legacy comparison`)
- 멘토 전략과 구현 전략 비교: `docs/70-policy/mentor-vs-implemented-strategy.md` (`legacy comparison`)
