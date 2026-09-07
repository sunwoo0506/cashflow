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

/**
 * G10 · 고정비 달별 집행상태 (R6)
 *
 * 고정비는 「매달 지급일에 그대로 나간다」가 기본이지만, 실제로는 한 달만 미루거나
 * 건너뛰는 일이 있다. 그 달만 상태를 바꿔도 나머지 달은 그대로여야 한다.
 * 일회성 지출(G9)과 같은 배치 규칙을 따르는지도 함께 본다.
 */
describe('G10 · 고정비 달별 집행상태', () => {
  /** 임차료 — 매달 1일, 8,500,000. 법인 필터가 없으므로 전액이 잡힌다. */
  const base = baseInput({ sources: AR_PLUS_NEW });
  const rent = base.fixedCosts.find((f) => f.item === '임차료')!;
  const RENT = 8_500_000;

  const withState = (monthlyState: Record<string, { execState: ExecState; deferToWeek?: string | null }>) =>
    runCashflow({
      ...base,
      fixedCosts: base.fixedCosts.map((f) => (f.id === rent.id ? { ...f, monthlyState } : f)),
    });

  const baseline = withState({});
  const fixedByWeek = (r: ReturnType<typeof runCashflow>): Record<string, number> =>
    Object.fromEntries(r.weeks.map((w) => [w.code, w.fixedCost]));

  /** 기본 대비 주별 고정비 변동. 합계만 보면 「옮겨졌다」가 검증되지 않는다. */
  const delta = (r: ReturnType<typeof runCashflow>): Record<string, number> => {
    const b = fixedByWeek(baseline);
    const a = fixedByWeek(r);
    return Object.fromEntries(
      Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, a[k]! - b[k]!]),
    );
  };

  it('금액 전제 · 임차료는 매달 1일 8,500,000 이다', () => {
    expect(rent.amount).toBe(RENT);
    expect(rent.payDay).toBe(1);
  });

  it('상태를 안 적으면 예전과 똑같다 — 기존 골든값이 흔들리지 않는다', () => {
    expect(baseline.totalOut).toBe(runCashflow(base).totalOut);
    expect(baseline.endCash).toBe(runCashflow(base).endCash);
    expect(delta(baseline)).toEqual({});
  });

  it('연기 · 기본 4주 → 그 달 지급일 주에서 빠지고 4주 뒤에 더해진다', () => {
    const r = withState({ '9월': { execState: '연기' } });
    const d = delta(r);
    const codes = Object.keys(d).sort();
    expect(codes).toHaveLength(2);
    const [from, to] = codes as [string, string];
    expect(d[from]).toBe(-RENT);
    expect(d[to]).toBe(RENT);
    expect(Number(to.slice(1)) - Number(from.slice(1))).toBe(4);
    // 기간 안에서 옮기기만 하므로 총액은 그대로다
    expect(r.totalOut).toBe(baseline.totalOut);
    expect(r.endCash).toBe(baseline.endCash);
  });

  it('연기 · 주차를 지정하면 그 주로 간다', () => {
    const r = withState({ '9월': { execState: '연기', deferToWeek: 'W22' } });
    expect(delta(r)['W22']).toBe(RENT);
    expect(r.totalOut).toBe(baseline.totalOut);
  });

  it('취소 → 그 달치만큼 총유출이 줄고 cancelled 로 남는다', () => {
    const r = withState({ '9월': { execState: '취소' } });
    expect(baseline.totalOut - r.totalOut).toBe(RENT);
    expect(r.cancelled.map((o) => o.expenseId)).toEqual([rent.id]);
    expect(r.deferredOutOfRange).toHaveLength(0);
    expect(Object.values(delta(r))).toEqual([-RENT]);
  });

  it('연기 · 기간 밖(out) → 어디에도 안 들어가고 deferredOutOfRange 로 남는다', () => {
    const r = withState({ '9월': { execState: '연기', deferToWeek: 'out' } });
    expect(baseline.totalOut - r.totalOut).toBe(RENT);
    expect(r.deferredOutOfRange.map((o) => o.expenseId)).toEqual([rent.id]);
    expect(r.cancelled).toHaveLength(0);
  });

  it('한 달만 건드리면 나머지 달은 그대로다', () => {
    const one = withState({ '9월': { execState: '취소' } });
    const two = withState({ '9월': { execState: '취소' }, '10월': { execState: '취소' } });
    expect(baseline.totalOut - two.totalOut).toBe(RENT * 2);
    expect(two.cancelled).toHaveLength(2);
    // 9월분 변동은 두 경우가 같다 — 10월 처리가 9월을 건드리지 않는다
    const d1 = delta(one);
    const d2 = delta(two);
    for (const [k, v] of Object.entries(d1)) expect(d2[k]).toBe(v);
  });

  it('다른 고정비 항목은 영향받지 않는다', () => {
    const r = withState({ '9월': { execState: '취소' } });
    const namesOf = (x: ReturnType<typeof runCashflow>) =>
      x.weeks.flatMap((w) => w.outflows).filter((o) => o.kind === '고정비' && o.placement === '집행').length;
    // 임차료 9월 1건만 집행 목록에서 빠진다
    expect(namesOf(baseline) - namesOf(r)).toBe(1);
  });
});
