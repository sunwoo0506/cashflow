import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCashflow } from '../src/index';
import { baseInput } from './fixture';

/**
 * legacy/index.html 의 run() 을 G1 입력으로 돌린 결과를 통째로 떠 놓은 것.
 * CLAUDE.md: "계산 결과가 그것과 달라지면 버그다."
 *
 * legacy 도 정수 원으로 맞췄으므로 **모든 값이 원 단위까지 정확히 일치**해야 한다.
 * 1원이라도 어긋나면 실패다.
 */
interface LegacyWeek {
  code: string; month: string; mw: number; label: string;
  plan: number; got: number; fixed: number; expense: number;
  out: number; open: number; cash: number;
}
interface LegacyMonth {
  code: string; plan: number; got: number; out: number; cash: number;
}

const legacy = JSON.parse(
  readFileSync(fileURLToPath(new URL('../__fixtures__/legacy-run-demo.json', import.meta.url)), 'utf8'),
) as { weeks: LegacyWeek[]; months: LegacyMonth[] };

describe('legacy run() 대조 (G1 입력)', () => {
  const r = runCashflow(baseInput());

  it('합계가 정확히 일치한다', () => {
    expect(r.totalIn).toBe(legacy.weeks.reduce((s, w) => s + w.got, 0));
    expect(r.totalOut).toBe(legacy.weeks.reduce((s, w) => s + w.out, 0));
    expect(r.endCash).toBe(legacy.weeks[legacy.weeks.length - 1]!.cash);
  });

  it('주 나누기가 legacy 와 완전히 같다 — 코드·소속 달·주차 번호·기간 (R1)', () => {
    expect(r.weeks.map((w) => ({ code: w.code, month: w.month, mw: w.monthWeek, label: w.label }))).toEqual(
      legacy.weeks.map((l) => ({ code: l.code, month: l.month, mw: l.mw, label: l.label })),
    );
  });

  it('지출은 원 단위까지 정확히 같다 (R6)', () => {
    expect(r.weeks.map((w) => [w.fixedCost, w.expense, w.outflow])).toEqual(
      legacy.weeks.map((l) => [l.fixed, l.expense, l.out]),
    );
  });

  it('주별 값이 원 단위까지 같다', () => {
    expect(
      r.weeks.map((w) => [w.planned, w.received, w.openingCash, w.cash]),
    ).toEqual(legacy.weeks.map((l) => [l.plan, l.got, l.open, l.cash]));
  });

  it('월별 값이 원 단위까지 같다', () => {
    expect(r.months.map((m) => [m.code, m.planned, m.received, m.outflow, m.cash])).toEqual(
      legacy.months.map((l) => [l.code, l.plan, l.got, l.out, l.cash]),
    );
  });
});
