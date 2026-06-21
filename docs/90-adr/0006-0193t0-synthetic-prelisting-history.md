# ADR 0006: 0193T0 상장 전 synthetic 히스토리

## 상태
승인

## 배경
- `0193T0`는 2026-05-27 상장 종목이라 장기 떨사오팔 백테스트에 필요한 과거 자체 시세가 없다.
- 제품 경계상 자동매매가 아니라 재현 가능한 연구용 백테스트 데이터셋이 필요하다.
- 사용자는 `000660` SK하이닉스 데이터를 2015-01-01부터 사용해 `0193T0`의 상장 전 가격을 추정해 넣기를 요청했다.

## 결정
- `0193T0` canonical 스냅샷은 `data/raw/0193t0_daily_2015_present.csv`다.
- `0193T0` 실제 row는 네이버 일별시세의 2026-05-27 이후 값을 그대로 사용한다.
- `0193T0` 상장 전 row는 `000660` 네이버 일별시세를 기반으로 synthetic 생성한다.
  - 앵커는 실제 `0193T0` 2026-05-27 종가다.
  - 일간 close 수익률은 `000660` 일간 close 수익률의 2배를 사용한다.
  - open/high/low도 전일 `000660` 종가 대비 상대 변동을 2배로 적용한다.
  - synthetic 2026-05-27 row는 버리고 실제 2026-05-27 row로 splice한다.
- `2015-01-01`은 거래소 휴장일이므로 canonical 첫 row는 `2015-01-02`다.
- synthetic row는 `source=synthetic_naver`로 저장하고 manifest와 `data status` 경고에 synthetic 기간을 남긴다.

## 결과
- `/backtests/0193T0`는 SOXL와 같은 9콤보 연구 UI를 재사용할 수 있다.
- `0193T0`는 `raw_close_with_actions`를 기본 가격 기준으로 사용한다.
- `SOXL` 전용 공식/멘토 참조 탭은 `referenceMode=backtest_only`로 숨긴다.
