import { describe, expect, it } from 'vitest';
import { ageReceivables, legacyAgingLedger, runCashflow, splitByRatio } from '../src/index';
import { SEED, baseInput } from './fixture';

/**
 * 골든 픽스처가 건드리지 않는 규칙들.
 * 문서에 규칙으로 적혀 있는데 G1~G9 로는 한 번도 실행되지 않는 경로를 직접 태운다.
 */

describe('R5 잔여분 fallback — 대응하는 신규매출 행이 없을 때', () => {
  /*
   * 픽스처는 회수월 매칭만으로 전부 소진되어 fallback 이 안 돈다 (문서에 명시).
   * 그래서 신규매출 목표를 8월·9월만 남겨 12월 회수분(42,500,000)이 갈 곳을 없앤다.
   *
   *   8월분 회수 10/15 → 대응 파이프라인 없음        108,000,000
   *   9월분 회수 11/14 → 11월 파이프라인 96,000,000  126,000,000 − 96,000,000 = 30,000,000
   *   남은 12월 몫 42,500,000 → 이른 순서대로, 즉 8월분에서 뺀다
   *                                                108,000,000 − 42,500,000 = 65,500,000
   */
  const b = baseInput({ sources: { ar: false, won: false, pipe: true, newSales: true } });
  const input = {
    ...b,
    assumptions: {
      ...b.assumptions,
      newSalesTargets: { '8월': 120_000_000, '9월': 140_000_000 },
    },
  };
  const r = runCashflow(input);
  const byRow = new Map<string, number>();
  for (const i of r.weeks.flatMap((w) => w.inflows).filter((i) => i.source === 'newSales')) {
    byRow.set(i.name, (byRow.get(i.name) ?? 0) + i.amount);
  }

  it('갈 곳 없던 12월 몫이 사라지지 않고 이른 달로 떠넘겨진다', () => {
    expect(byRow.get('8월 매출분 회수')).toBe(65_500_000);
    expect(byRow.get('9월 매출분 회수')).toBe(30_000_000);
  });

  it('차감 총액은 여전히 정확히 파이프라인 기대값 138,500,000 이다', () => {
    const placed = [...byRow.values()].reduce((s, v) => s + v, 0);
    expect(placed).toBe(234_000_000 - 138_500_000);
    // 차감이 사라지면 이중계산이 남는다 — 그것만은 안 된다
    expect(r.totalIn).toBe(138_500_000 + placed);
  });

  it('떠넘길 자리보다 차감이 크면 0 에서 멈추고 음수가 되지 않는다', () => {
    const tiny = runCashflow({
      ...input,
      assumptions: { ...input.assumptions, newSalesTargets: { '8월': 10_000_000 } },
    });
    const ns = tiny.weeks.flatMap((w) => w.inflows).filter((i) => i.source === 'newSales');
    expect(ns).toHaveLength(0);
    expect(tiny.totalIn).toBe(138_500_000);
  });
});

describe('R3-b · 회수예정일 없는 채권을 기간 마지막 칸에 몰지 않는다', () => {
  const b = baseInput({ sources: { ar: true, won: false, pipe: false, newSales: false } });

  it('회수예정일 없는 채권은 현금흐름에 개별 건으로 들어가지 않는다', () => {
    const withUndated = runCashflow({
      ...b,
      receivables: [
        ...b.receivables,
        {
          id: 'undated-1',
          entity: '법인A',
          counterparty: '회수예정일 미정',
          kind: '일반매출' as const,
          stage: '청구완료' as const,
          status: 'open' as const,
          amountOpen: 900_000_000,
          dueDate: null,
        },
      ],
    });
    expect(withUndated.totalIn).toBe(runCashflow(b).totalIn);
    const last = withUndated.weeks[withUndated.weeks.length - 1]!;
    expect(last.inflows.some((i) => i.amount === 900_000_000)).toBe(false);
  });

  it('undatedAllocation 이 비어 있으면 현금흐름에서 제외한다 — 임의의 칸에 놓지 않는다', () => {
    const none = runCashflow({
      ...b,
      assumptions: {
        ...b.assumptions,
        undatedReceivables: { ...b.assumptions.undatedReceivables!, undatedAllocation: {} },
      },
    });
    // 잔여 채권 배분액((잔여채권 − 계획분) × 집행률) 만큼만 빠진다
    const u = b.assumptions.undatedReceivables!;
    const pot = Math.round(Math.max(0, u.receivableTotal - u.plannedDeduction) * u.execRate);
    expect(runCashflow(b).totalIn - none.totalIn).toBe(pot);
  });
});

describe('R8 · 연령분석 법인 필터', () => {
  const ledger = legacyAgingLedger(SEED);
  const all = ageReceivables(ledger, '2026-08-13');

  it('법인별 합이 전체와 같다', () => {
    const z = ageReceivables(ledger, '2026-08-13', { entityFilter: '법인A' });
    const n = ageReceivables(ledger, '2026-08-13', { entityFilter: '법인B' });
    // '전체' 로 잡힌 회수예정일 미정 역산분은 어느 법인에도 속하지 않는다
    const undated = all.buckets['회수예정일 미정'];
    expect(z.total + n.total + undated).toBe(all.total);
  });

  it('필터 결과가 byEntity 집계와 일치한다', () => {
    for (const entity of ['법인A', '법인B']) {
      const one = ageReceivables(ledger, '2026-08-13', { entityFilter: entity });
      expect(one.buckets).toEqual(all.byEntity[entity]);
    }
  });
});

describe('splitByRatio · 경계', () => {
  it('비율 합이 0 이면 전부 0 을 돌려준다', () => {
    expect(splitByRatio(1000, [0, 0])).toEqual([0, 0]);
    expect(splitByRatio(1000, [])).toEqual([]);
  });

  it('어떤 비율이든 조각의 합은 정확히 원금이다', () => {
    const cases: Array<[number, number[]]> = [
      [277_707_878, [0.25, 0.3, 0.25, 0.2]],
      [1, [1, 1, 1]],
      [100, [1, 2, 3, 4, 5, 6, 7]],
      [-5_000, [0.2, 0.8]],
    ];
    for (const [total, ratios] of cases) {
      expect(splitByRatio(total, ratios).reduce((s, v) => s + v, 0)).toBe(total);
    }
  });

  it('모든 구간의 누적합 오차가 1원을 넘지 않는다', () => {
    const ratios = [0.17, 0.23, 0.11, 0.29, 0.2];
    const total = 1_000_000_007;
    const parts = splitByRatio(total, ratios);
    const sum = ratios.reduce((a, b) => a + b, 0);
    let cum = 0;
    let exact = 0;
    parts.forEach((p, i) => {
      cum += p;
      exact += (total * ratios[i]!) / sum;
      expect(Math.abs(cum - exact)).toBeLessThanOrEqual(1);
    });
  });
});
