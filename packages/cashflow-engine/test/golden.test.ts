import { describe, expect, it } from 'vitest';
import { runCashflow, winRateOf, type SalesStage } from '../src/index';
import { baseInput } from './fixture';
import { GOLDEN as G } from './expected';

/**
 * docs/05-CALC-ENGINE.md 의 골든 테스트.
 * 데이터는 가상 샘플이지만, **값이 달라지면 계산이 달라진 것**이므로 그대로 기준이 된다.
 */
describe('G1 · 기본 (확정 채권 + 신규매출 가정, 달성률 100%, 전체 통합)', () => {
  const r = runCashflow(
    baseInput({ sources: { ar: true, won: false, pipe: false, newSales: true } }),
  );

  it('주 23칸 · 월 5칸 — 22주를 넣으면 12/31 에서 잘려 23주가 된다 (R1)', () => {
    expect(r.weeks).toHaveLength(G.g1.weeks);
    expect(r.months).toHaveLength(G.g1.months);
    expect(r.weeks).toHaveLength(23);
    expect(r.months).toHaveLength(5);
  });

  it('총유입·총유출·기말 잔고', () => {
    expect(r.totalIn).toBe(G.g1.totalIn);
    expect(r.totalOut).toBe(G.g1.totalOut);
    expect(r.endCash).toBe(G.g1.endCash);
  });

  it('최저 잔고와 그 주차', () => {
    expect(r.min.cash).toBe(G.g1.minCash);
    expect(r.min.code).toBe(G.g1.minCode);
  });

  it('바닥나지 않고 안전선도 넘는다', () => {
    expect(r.bottom?.code ?? null).toBe(G.g1.bottom);
    expect(r.shortfall).toBe(G.g1.shortfall);
  });

  it('달성률 100% 면 미회수 이월이 없다', () => expect(r.unpaid).toBe(0));

  it('기말 잔고 = 기초 + 총유입 − 총유출 (R7)', () => {
    expect(r.endCash).toBe(G.openingCash + r.totalIn - r.totalOut);
  });

  it('주 합계와 월 합계가 어긋나지 않는다 (R2 재집계)', () => {
    const sum = (xs: { received: number; outflow: number }[]) => ({
      in: xs.reduce((s, x) => s + x.received, 0),
      out: xs.reduce((s, x) => s + x.outflow, 0),
    });
    expect(sum(r.months)).toEqual(sum(r.weeks));
  });

  it('W01 은 이틀짜리 주 — 유입 없이 고정비만 나간다', () => {
    const w1 = r.weeks[0]!;
    expect(w1.received).toBe(0);
    expect(w1.cash).toBe(G.openingCash - w1.fixedCost - w1.expense);
  });
});

/** 유입 소스 조합 */
const totalIn = (ar: boolean, won: boolean, pipe: boolean, newSales: boolean): number =>
  runCashflow(baseInput({ sources: { ar, won, pipe, newSales } })).totalIn;

describe('G2 · 유입 소스 조합 (달성률 100%, 전체 통합)', () => {
  it('소스를 켤수록 총유입이 늘어난다', () => {
    expect(totalIn(true, false, false, false)).toBe(G.g2.arOnly);
    expect(totalIn(true, true, false, false)).toBe(G.g2.plusWon);
    expect(totalIn(true, true, true, false)).toBe(G.g2.plusPipe);
    expect(totalIn(true, true, true, true)).toBe(G.g2.all);
  });

  it('확정 채권 + 신규매출 가정 = G1 과 같다', () => {
    expect(totalIn(true, false, false, true)).toBe(G.g1.totalIn);
  });

  it('수주확정 증분 = 45,000,000 + 28,000,000', () => {
    expect(G.g2.plusWon - G.g2.arOnly).toBe(73_000_000);
    expect(G.g2.soloWon).toBe(73_000_000);
  });

  it('파이프라인 증분 = 120M×0.7 + 85M×0.5 + 40M×0.3', () => {
    expect(G.g2.plusPipe - G.g2.plusWon).toBe(138_500_000);
    expect(G.g2.soloPipe).toBe(138_500_000);
  });

  it('네 개 다 켠 값은 단순 합보다 정확히 파이프라인 기대값만큼 작다 (R5)', () => {
    const naiveSum = G.g2.plusPipe + (G.g2.arPlusNew - G.g2.arOnly);
    expect(naiveSum - G.g2.all).toBe(138_500_000);
  });
});

describe('G3 · 확률 자동 적용 (직접입력 > 단계 기본값 > 0.5)', () => {
  const rate = (salesStage: string, winRateOverride: number | null) =>
    winRateOf({ salesStage: salesStage as SalesStage, winRateOverride });

  it.each([
    ['협상', null, 0.7],
    ['견적', null, 0.5],
    ['상담', null, 0.3],
    ['견적', 0.9, 0.9],
    ['', null, 0.5],
  ] as const)('%s · 직접입력 %s → %s', (stage, override, expected) => {
    expect(rate(stage, override)).toBe(expected);
  });

  it('직접입력이 있으면 영업단계를 바꿔도 확률이 안 바뀐다', () => {
    for (const stage of ['상담', '견적', '협상'] as const) expect(rate(stage, 0.9)).toBe(0.9);
  });

  it('직접입력을 지우면 단계 기본값으로 돌아온다', () => {
    expect(rate('협상', 0.9)).toBe(0.9);
    expect(rate('협상', null)).toBe(0.7);
  });
});

describe('G4 · 파이프라인 → 수주확정 이관 (won + pipe 만)', () => {
  const onlyWonPipe = { ar: false, won: true, pipe: true, newSales: false };
  const before = baseInput({ sources: onlyWonPipe });

  /** 협상(70%) 1.2억 건을 1.15억에 수주확정으로 옮긴다 */
  const moved = before.opportunities.find((o) => o.salesStage === '협상')!;
  const after = baseInput({
    sources: onlyWonPipe,
    opportunities: before.opportunities.filter((o) => o.id !== moved.id),
    receivables: [
      ...before.receivables,
      {
        id: `won-from-${moved.id}`,
        entity: moved.entity,
        counterparty: moved.name,
        kind: '일반매출' as const,
        stage: '청구전' as const,
        status: 'open' as const,
        amountOpen: 115_000_000,
        dueDate: moved.expectedDate,
      },
    ],
  });

  it('이관 전 = 수주확정 73,000,000 + 파이프라인 138,500,000', () => {
    expect(runCashflow(before).totalIn).toBe(211_500_000);
    expect(before.opportunities).toHaveLength(3);
  });

  it('이관 후 = 확률 70% 기대값(84,000,000)이 확정 115,000,000 으로 바뀐다', () => {
    expect(runCashflow(after).totalIn).toBe(211_500_000 - 84_000_000 + 115_000_000);
    expect(after.opportunities).toHaveLength(2);
    expect(after.receivables.filter((r) => r.stage === '청구전')).toHaveLength(3);
  });

  it('되돌리면 단계·금액·확률·예상 입금일이 그대로 복원된다', () => {
    expect(runCashflow(before).totalIn).toBe(211_500_000);
    expect(moved.salesStage).toBe('협상');
    expect(moved.amountExpected).toBe(120_000_000);
    expect(winRateOf(moved)).toBe(0.7);
    expect(moved.expectedDate).toBe('2026-11-20');
  });
});

describe('R5 · 회수월 기준 매칭 (매출월로 맞추면 차감이 사라진다)', () => {
  const r = runCashflow(
    baseInput({ sources: { ar: false, won: false, pipe: true, newSales: true } }),
  );
  const byRow = new Map<string, number>();
  for (const i of r.weeks.flatMap((w) => w.inflows).filter((i) => i.source === 'newSales')) {
    byRow.set(i.name, (byRow.get(i.name) ?? 0) + i.amount);
  }

  it('11월·12월분은 회수일이 내년이라 배치되지 않는다', () => {
    expect([...byRow.keys()].sort()).toEqual(Object.keys(G.r5.newSalesByRow).sort());
  });

  it('8월분 = 108,000,000 — 회수월 10월에 파이프라인이 없어 차감 없음', () => {
    expect(byRow.get('8월 매출분 회수')).toBe(108_000_000);
  });

  it('9월분 — 회수월 11월 파이프라인 96,000,000 을 뺀다', () => {
    // 140,000,000 × 0.9 − (120M×0.7 + 40M×0.3)
    expect(byRow.get('9월 매출분 회수')).toBe(126_000_000 - 96_000_000);
  });

  it('10월분 — 회수월 12월 파이프라인 42,500,000 을 뺀다', () => {
    // 150,000,000 × 0.9 − 85M×0.5
    expect(byRow.get('10월 매출분 회수')).toBe(135_000_000 - 42_500_000);
  });

  it('차감 총액이 정확히 파이프라인 기대값이고 잔여분이 없다', () => {
    const placed = [...byRow.values()].reduce((s, v) => s + v, 0);
    expect(G.r5.grossNewSales - placed).toBe(138_500_000);
    expect(r.totalIn).toBe(138_500_000 + placed);
  });
});
