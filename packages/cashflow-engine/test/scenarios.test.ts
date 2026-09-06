import { describe, expect, it } from 'vitest';
import { runCashflow, type ExecState } from '../src/index';
import { baseInput } from './fixture';
import { GOLDEN as G } from './expected';

const AR_PLUS_NEW = { ar: true, won: false, pipe: false, newSales: true };

/**
 * G7 · 달성률 시나리오.
 * R4 이월 누적과 bottom·shortfall 검출을 검증한다.
 * 100% 만으로는 이 경로가 한 번도 돌지 않는다.
 */
describe('G7 · 달성률 시나리오 (확정 채권 + 신규매출 가정, 전체 통합)', () => {
  const at = (rate: number) =>
    runCashflow(baseInput({ sources: AR_PLUS_NEW, achievementRate: rate }));

  it.each(G.g7)('달성률 $rate', (c) => {
    const r = at(c.rate);
    expect(r.totalIn, 'totalIn').toBe(c.totalIn);
    expect(r.endCash, 'endCash').toBe(c.endCash);
    expect(r.min.code, 'min.code').toBe(c.minCode);
    expect(r.min.cash, 'min.cash').toBe(c.minCash);
    expect(r.bottom?.code ?? null, 'bottom').toBe(c.bottom);
    expect(r.shortfall, 'shortfall').toBe(c.shortfall);
    expect(r.unpaid, 'unpaid').toBe(c.unpaid);
  });

  it('endCash 는 어느 달성률에서나 기초 + 총유입 − 총유출 이다 (R7)', () => {
    for (const c of G.g7) {
      const r = at(c.rate);
      expect(r.endCash).toBe(G.openingCash + r.totalIn - r.totalOut);
    }
  });

  it('총유입 + 미회수 이월 = 달성률 100% 의 총유입 (R4 이월 보존)', () => {
    for (const c of G.g7) {
      const r = at(c.rate);
      expect(r.totalIn + r.unpaid).toBe(G.g1.totalIn);
    }
  });

  it('달성률이 낮을수록 총유입이 줄고 이월이 는다 (단조성)', () => {
    const sorted = [...G.g7].sort((a, b) => b.rate - a.rate);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.totalIn).toBeLessThanOrEqual(sorted[i - 1]!.totalIn);
      expect(sorted[i]!.unpaid).toBeGreaterThanOrEqual(sorted[i - 1]!.unpaid);
    }
  });

  it('bottom 이 한 번 생기면 더 낮은 달성률에서도 계속 생긴다', () => {
    const sorted = [...G.g7].sort((a, b) => b.rate - a.rate);
    const firstBottom = sorted.findIndex((c) => c.bottom !== null);
    expect(firstBottom).toBeGreaterThan(0); // 100% 에서는 안 생긴다
    for (let i = firstBottom; i < sorted.length; i++) {
      expect(sorted[i]!.bottom, `달성률 ${sorted[i]!.rate}`).not.toBeNull();
    }
  });

  it('min.code 와 bottom 은 다른 개념이다 — 한 값으로 뭉개면 안 된다', () => {
    // bottom = 처음으로 0 아래로 내려간 주 · min = 가장 낮은 주
    const differ = G.g7.filter((c) => c.bottom !== null && c.bottom !== c.minCode);
    expect(differ.length, '둘이 갈리는 시나리오가 있어야 이 구분이 검증된다').toBeGreaterThan(0);
  });

  it('안전선을 넘으면 shortfall 은 0, 못 넘으면 그 차액이다', () => {
    for (const c of G.g7) {
      if (c.minCash >= G.warnLine) expect(c.shortfall).toBe(0);
      else expect(c.shortfall).toBe(G.warnLine - c.minCash);
    }
  });

  it('0% 는 totalIn 이 0 이고 unpaid 가 100% 의 totalIn 과 같다 (전액 이월)', () => {
    expect(at(0).totalIn).toBe(0);
    expect(at(0).unpaid).toBe(at(1).totalIn);
  });

  it('totalOut 은 달성률과 무관하다', () => {
    for (const c of G.g7) expect(at(c.rate).totalOut).toBe(G.g1.totalOut);
  });
});

/** G8 · 법인 단독 — 고정비 배분·유입 필터링·신규매출 법인 배분 */
describe('G8 · 법인 단독 (달성률 100%)', () => {
  const at = (entity: string | null) =>
    runCashflow(baseInput({ sources: AR_PLUS_NEW, entityFilter: entity }));

  it.each(G.g8)('$entity', (c) => {
    const r = at(c.entity);
    expect(r.totalIn, 'totalIn').toBe(c.totalIn);
    expect(r.totalOut, 'totalOut').toBe(c.totalOut);
    expect(r.endCash, 'endCash').toBe(c.endCash);
    expect(r.min.code, 'min.code').toBe(c.minCode);
    expect(r.min.cash, 'min.cash').toBe(c.minCash);
  });

  it('법인별 총유출 합이 전체와 일치한다 (고정비 배분 검증)', () => {
    const each = G.g8.filter((c) => c.entity !== null);
    const all = G.g8.find((c) => c.entity === null)!;
    expect(each.reduce((s, c) => s + c.totalOut, 0)).toBe(all.totalOut);
  });

  it('법인별 총유입 합도 전체와 일치한다', () => {
    const each = G.g8.filter((c) => c.entity !== null);
    const all = G.g8.find((c) => c.entity === null)!;
    expect(each.reduce((s, c) => s + c.totalIn, 0)).toBe(all.totalIn);
  });
});

/** G9 · 일회성 지출 연기·취소 (R6) */
describe('G9 · 일회성 지출 연기·취소', () => {
  const TARGET = G.g9.targetId;

  const withState = (edits: Record<string, { exec: ExecState; toWeek?: string | null }>) => {
    const b = baseInput({ sources: AR_PLUS_NEW });
    return runCashflow({
      ...b,
      expenses: b.expenses.map((e) => {
        const edit = edits[e.id];
        return edit ? { ...e, execState: edit.exec, deferToWeek: edit.toWeek ?? null } : e;
      }),
    });
  };

  const baseline = withState({});
  const expenseByWeek = (r: ReturnType<typeof runCashflow>): Record<string, number> =>
    Object.fromEntries(r.weeks.map((w) => [w.code, w.expense]));

  /** 기본 대비 주별 「기타 지출」 변동. 합계만 보면 연기가 검증되지 않는다. */
  const delta = (r: ReturnType<typeof runCashflow>): Record<string, number> => {
    const b = expenseByWeek(baseline);
    const a = expenseByWeek(r);
    return Object.fromEntries(
      Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, a[k]! - b[k]!]),
    );
  };

  it('기본 · 전부 집행', () => {
    expect(baseline.totalOut).toBe(G.g9.baseTotalOut);
    expect(baseline.endCash).toBe(G.g9.baseEndCash);
  });

  it('연기 · 기본 4주 → 원래 주에서 빠지고 정확히 4주 뒤에 더해진다', () => {
    const r = withState({ [TARGET]: { exec: '연기' } });
    const d = delta(r);
    expect(d).toEqual(G.g9.deferDefault);

    const codes = Object.keys(d).sort();
    const from = codes[0]!;
    const to = codes[codes.length - 1]!;
    expect(d[from]).toBe(-G.g9.targetAmount);
    expect(d[to]).toBe(G.g9.targetAmount);
    expect(Number(to.slice(1)) - Number(from.slice(1))).toBe(4);

    // 기간 안에서 옮기기만 하므로 총액은 그대로다
    expect(r.totalOut).toBe(G.g9.baseTotalOut);
    expect(r.endCash).toBe(G.g9.baseEndCash);
  });

  it('연기 · 주차를 지정하면 그 주로 간다', () => {
    const r = withState({ [TARGET]: { exec: '연기', toWeek: 'W22' } });
    expect(delta(r)['W22']).toBe(G.g9.targetAmount);
    expect(r.totalOut).toBe(G.g9.baseTotalOut);
  });

  it('연기 · 기간 밖(out) → 어디에도 안 들어가고 deferredOutOfRange 로 남는다', () => {
    const r = withState({ [TARGET]: { exec: '연기', toWeek: 'out' } });
    expect(delta(r)).toEqual(G.g9.deferOut.delta);
    expect(r.totalOut).toBe(G.g9.deferOut.totalOut);
    expect(r.deferredOutOfRange.map((o) => o.expenseId)).toEqual([TARGET]);
    expect(r.cancelled).toHaveLength(0);
  });

  it('취소 → 총액은 기간 밖 연기와 같지만 기록은 cancelled 로 다르다', () => {
    const r = withState({ [TARGET]: { exec: '취소' } });
    expect(delta(r)).toEqual(G.g9.cancel.delta);
    expect(r.totalOut).toBe(G.g9.cancel.totalOut);
    expect(r.endCash).toBe(G.g9.cancel.endCash);
    expect(r.cancelled.map((o) => o.expenseId)).toEqual([TARGET]);
    expect(r.deferredOutOfRange).toHaveLength(0);
    expect(r.totalOut).toBe(G.g9.deferOut.totalOut);
  });

  it('과거 주차로는 미룰 수 없다 — 기본 지연 주수를 적용한다', () => {
    const back = withState({ [TARGET]: { exec: '연기', toWeek: 'W01' } });
    const dflt = withState({ [TARGET]: { exec: '연기' } });
    expect(delta(back)).toEqual(delta(dflt));
  });

  it('취소·연내 미집행은 총유출을 그 금액만큼 줄인다', () => {
    expect(G.g9.baseTotalOut - G.g9.cancel.totalOut).toBe(G.g9.targetAmount);
    expect(G.g9.baseTotalOut - G.g9.deferOut.totalOut).toBe(G.g9.targetAmount);
  });
});
