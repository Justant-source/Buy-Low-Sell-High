# 전략 정책

## 제품 경계
- SOXL 일봉 데이터만 사용
- 리서치, 파리티, 대시보드, 수동 장부까지만 포함
- 브로커 연동 금지
- 자동 주문 제출 금지
- Redis, Bybit, Telegram 매매 명령 금지

## 구현 원칙
- 보유 기간은 달력일이 아니라 거래소 세션 기준으로 계산한다.
- 레퍼런스 무결성을 지킨다. 불일치를 숨기기 위해 fixture를 수정하지 않는다.
- `ideal_same_close` 연구용 출력과 현실적인 수동 체결 출력은 분리한다.

## 현재 전략 참조 문서
- **전략 SSOT (매매 로직·파라미터·백테스트 준거)**: `docs/70-policy/ddeolsao-pal-ssot.md`
- 실행 가능한 기준 의미론: `docs/90-adr/0001-mentor-semantics.md`
- 멘토 화면 및 parity 의미론: `docs/90-adr/0002-mentor-reference-screen.md`
- 멘토 전략과 구현 전략 비교: `docs/70-policy/mentor-vs-implemented-strategy.md`
