# cashflow-engine

「현금이 언제 바닥나는가」를 계산하는 순수 함수 묶음. 의존성 0.

`legacy/index.html` 의 `run()` 을 이식한 것이다. **계산 결과가 그것과 달라지면 버그다.**

```ts
import { runCashflow, ageReceivables } from 'cashflow-engine';

const r = runCashflow({ asOf: '2026-08-13', startDate: '2026-08-01', weeks: 22, … });
r.min.cash;   // 잔고 최저 주차
r.bottom;     // 처음으로 잔고 < 0 이 되는 주차 (없으면 null)
```

## 구조

| 파일 | 규칙 |
|---|---|
| `calendar.ts` | 달력 유틸. **전부 UTC** — 타임존 따라 값이 달라지면 안 된다 |
| `money.ts` | 정수 원 단위. 비율로 쪼갤 때는 **누적합 반올림** (규칙 6) |
| `periods.ts` | R1 주 나누기 · R2 계산 단위(주 ∩ 달력 월) |
| `inflow.ts` | R3 유입 배치 · R3-b 회수예정일 없는 채권 · R5 이중계산 방지 (**회수월** 기준) |
| `outflow.ts` | R6 지출 배치 |
| `winRate.ts` | G3 확률 (직접입력 > 단계 기본값 > 0.5) |
| `run.ts` | R4 달성률·이월 (누적 반올림) · R7 잔고 누적 · 주/월 묶기 |
| `aging.ts` | R8 연령분석 — **잔액을 나눈다. 매출액이 아니다** |
| `adapters/legacySeed.ts` | 프로토타입 시드 → 도메인 모델 |

`src` 안에서는 아무것도 import 하지 않는다. `test/purity.test.ts` 가 그것을 강제한다 —
외부 모듈 · `Date.now()` · `fetch` · `localStorage` · `process.env` 가 들어오면 실패한다.

## 테스트

```bash
pnpm --filter cashflow-engine test
```

| 파일 | 무엇을 |
|---|---|
| `test/golden.test.ts` | G1 기본 · G2 소스 조합 · G3 확률 · G4 이관 · R5 회수월 매칭 |
| `test/aging.test.ts` | G5 연령분석 · G6 회귀 방지 |
| `test/scenarios.test.ts` | G7 달성률 시나리오 · G8 법인 단독 · G9 연기·취소 |
| `test/rules.test.ts` | 골든 픽스처가 안 건드리는 규칙 (R5 fallback · R3-b · 연령분석 필터) |
| `test/legacy-parity.test.ts` | legacy `run()` 결과와 주·월 단위로 대조 |
| `test/purity.test.ts` | 엔진이 순수한지 |

## 두 가지 판단

**1. 이중계산 방지는 회수월로 맞춘다 (R5).**
맞춰야 하는 축은 매출이 난 달이 아니라 현금이 들어오는 달이다. 이 픽스처의 파이프라인은
11월·12월 회수인데 11월분·12월분 신규매출은 회수일이 내년이라 배치되지 않는다.
매출월로 찾으면 차감 138,500,000 이 통째로 사라지고, 회수월로 찾으면
11월 → 9월분(회수 11/14) · 12월 → 10월분(회수 12/15) 에 정확히 걸린다.

**2. 조각이 아니라 누적합을 반올림한다 (`money.ts` · `run.ts` R4).**
금액은 정수 원이다(규칙 6). 조각마다 따로 반올림하면 잔고가 몇 원씩 밀리는데,
화면에서 사람이 읽는 것은 조각이 아니라 잔고다. 그래서
`조각ₖ = round(누적합ₖ) − round(누적합ₖ₋₁)` 로 자른다.
합계는 정확하고, 어느 구간에서도 누적 오차가 0.5원을 넘지 않는다.

`legacy/index.html` 의 `run()` 에도 같은 규칙을 넣었다. 그래서 legacy 와 이 엔진은
**주별·월별·합계 전부 원 단위까지 일치**한다.
