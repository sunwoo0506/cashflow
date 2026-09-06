import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { AGING_BUCKETS, ageReceivables, runCashflow, type ExecState } from '../src/index';
import { SEED, baseInput } from './fixture';
import { legacyAgingLedger } from '../src/index';

/**
 * 골든 기대값 스냅샷을 만든다. 평소에는 돌지 않는다 (파일 이름이 _ 로 시작).
 *
 *   GEN=1 pnpm --filter cashflow-engine test
 *
 * 샘플 데이터를 다시 만들면 이걸 한 번 돌려 기대값을 갱신한다.
 * 값이 바뀌는 것 자체가 「계산이 달라졌다」는 뜻이므로, 왜 바뀌었는지 확인하고 갱신한다.
 */
const AR_NEW = { ar: true, won: false, pipe: false, newSales: true };
const AS_OF = '2026-08-13';

// 평소에는 건너뛴다. 갱신할 때만 GEN=1 을 준다.
const gen = process.env.GEN === '1' ? it : it.skip;

gen('기대값 스냅샷 생성', () => {
  const at = (rate: number) => runCashflow(baseInput({ sources: AR_NEW, achievementRate: rate }));
  const byEntity = (entity: string | null) =>
    runCashflow(baseInput({ sources: AR_NEW, entityFilter: entity }));

  const one = (k: 'ar' | 'won' | 'pipe' | 'newSales') =>
    runCashflow(
      baseInput({
        achievementRate: 1,
        sources: { ar: false, won: false, pipe: false, newSales: false, [k]: true },
      }),
    ).totalIn;

  const combo = (ar: boolean, won: boolean, pipe: boolean, ns: boolean) =>
    runCashflow(baseInput({ sources: { ar, won, pipe, newSales: ns } })).totalIn;

  const base = at(1);
  const ledger = legacyAgingLedger(SEED);
  const aging = ageReceivables(ledger, AS_OF);

  /* G9 · 일회성 지출 연기·취소 */
  const withState = (edits: Record<string, { exec: ExecState; toWeek?: string | null }>) => {
    const b = baseInput({ sources: AR_NEW });
    return runCashflow({
      ...b,
      expenses: b.expenses.map((e) => {
        const edit = edits[e.id];
        return edit ? { ...e, execState: edit.exec, deferToWeek: edit.toWeek ?? null } : e;
      }),
    });
  };
  const expenseByWeek = (r: ReturnType<typeof runCashflow>) =>
    Object.fromEntries(r.weeks.map((w) => [w.code, w.expense]));
  const baseline = withState({});
  const delta = (r: ReturnType<typeof runCashflow>) => {
    const b = expenseByWeek(baseline);
    const a = expenseByWeek(r);
    return Object.fromEntries(
      Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, a[k]! - b[k]!]),
    );
  };
  // 기간 안에서 금액이 가장 큰 일회성 지출을 대상으로 삼는다
  const target = [...baseInput({ sources: AR_NEW }).expenses]
    .filter((e) => e.date >= '2026-09-01' && e.date <= '2026-11-30')
    .sort((a, b) => b.amount - a.amount)[0]!;

  /* R5 · 회수월 매칭으로 달마다 얼마가 배치되는가 */
  const pipeNew = runCashflow(
    baseInput({ sources: { ar: false, won: false, pipe: true, newSales: true } }),
  );
  const newSalesByRow: Record<string, number> = {};
  for (const i of pipeNew.weeks.flatMap((w) => w.inflows).filter((i) => i.source === 'newSales')) {
    newSalesByRow[i.name] = (newSalesByRow[i.name] ?? 0) + i.amount;
  }

  const snapshot = {
    _: '자동 생성 — test/_snapshot.ts 로 갱신한다. 손으로 고치지 않는다.',
    asOf: AS_OF,
    openingCash: 80_000_000,
    warnLine: 50_000_000,

    g1: {
      weeks: base.weeks.length,
      months: base.months.length,
      totalIn: base.totalIn,
      totalOut: base.totalOut,
      endCash: base.endCash,
      minCash: base.min.cash,
      minCode: base.min.code,
      bottom: base.bottom?.code ?? null,
      shortfall: base.shortfall,
      unpaid: base.unpaid,
    },

    g2: {
      arOnly: combo(true, false, false, false),
      plusWon: combo(true, true, false, false),
      plusPipe: combo(true, true, true, false),
      all: combo(true, true, true, true),
      arPlusNew: combo(true, false, false, true),
      soloAr: one('ar'),
      soloWon: one('won'),
      soloPipe: one('pipe'),
      soloNewSales: one('newSales'),
    },

    g5: {
      buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, aging.buckets[b]])),
      total: aging.total,
      over60: aging.buckets['60일'] + aging.buckets['90일'] + aging.buckets['90일초과'],
      internalTotal: ledger.filter((r) => r.isInternal).reduce((s, r) => s + r.amountOpen, 0),
      negativeCount: (SEED.ar?.neg ?? []).length,
      negativeSum: (SEED.ar?.neg ?? []).reduce((s, x) => s + x['잔액'], 0),
    },

    g7: [1, 0.8, 0.5, 0.35, 0.25, 0.15, 0.1, 0].map((rate) => {
      const r = at(rate);
      return {
        rate,
        totalIn: r.totalIn,
        endCash: r.endCash,
        minCode: r.min.code,
        minCash: r.min.cash,
        bottom: r.bottom?.code ?? null,
        shortfall: r.shortfall,
        unpaid: r.unpaid,
      };
    }),

    g8: [null, '법인A', '법인B'].map((entity) => {
      const r = byEntity(entity);
      return {
        entity,
        totalIn: r.totalIn,
        totalOut: r.totalOut,
        endCash: r.endCash,
        minCode: r.min.code,
        minCash: r.min.cash,
      };
    }),

    g9: {
      targetId: target.id,
      targetItem: target.item,
      targetAmount: target.amount,
      targetDate: target.date,
      baseTotalOut: baseline.totalOut,
      baseEndCash: baseline.endCash,
      deferDefault: delta(withState({ [target.id]: { exec: '연기' } })),
      cancel: {
        delta: delta(withState({ [target.id]: { exec: '취소' } })),
        totalOut: withState({ [target.id]: { exec: '취소' } }).totalOut,
        endCash: withState({ [target.id]: { exec: '취소' } }).endCash,
      },
      deferOut: {
        delta: delta(withState({ [target.id]: { exec: '연기', toWeek: 'out' } })),
        totalOut: withState({ [target.id]: { exec: '연기', toWeek: 'out' } }).totalOut,
      },
    },

    r5: {
      newSalesByRow,
      pipelineExpected: one('pipe'),
      grossNewSales: one('newSales'),
    },

    weekLabels: Object.fromEntries(base.weeks.map((w) => [w.code, w.label])),
  };

  const out = fileURLToPath(new URL('../__fixtures__/golden-expected.json', import.meta.url));
  writeFileSync(out, JSON.stringify(snapshot, null, 1), 'utf8');
  console.log('기대값 스냅샷 생성:', out);
  console.log(JSON.stringify(snapshot.g1));
});
