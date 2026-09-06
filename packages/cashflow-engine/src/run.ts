import { rangeLabel, toISO } from './calendar';
import { won } from './money';
import { buildHorizon, type Segment, type WeekSpan } from './periods';
import { placeInflows } from './inflow';
import { placeOutflows } from './outflow';
import type { CashflowInput, CashflowResult, Period } from './types';

/** 계산 단위 여럿을 한 칸으로 묶는다 (주 · 월 공용) */
function roll(list: Segment[], base: Pick<Period, 'code' | 'label' | 'month'> & { monthWeek?: number }): Period {
  const first = list[0]!;
  const last = list[list.length - 1]!;
  const p: Period = {
    ...base,
    start: toISO(first.start),
    end: toISO(last.end),
    planned: 0,
    received: 0,
    carry: last.carry,
    fixedCost: 0,
    expense: 0,
    outflow: 0,
    net: 0,
    openingCash: first.openingCash,
    cash: last.cash,
    inflows: [],
    outflows: [],
  };
  for (const s of list) {
    p.planned += s.planned;
    p.received += s.received;
    p.fixedCost += s.fixedCost;
    p.expense += s.expense;
    p.inflows.push(...s.inflows);
    p.outflows.push(...s.outflows);
  }
  p.outflow = p.fixedCost + p.expense;
  p.net = p.received - p.outflow;
  return p;
}

/**
 * 주간 자금 계획을 계산한다.
 * 순수 함수 — 같은 입력이면 어느 기계에서든 같은 값이 나온다. 기준일도 인자다.
 */
export function runCashflow(input: CashflowInput): CashflowResult {
  const horizon = buildHorizon(input.startDate, input.weeks);
  const { weeks: spans, segments } = horizon;

  placeInflows(input, segments, horizon.end);

  /* ── R4 · 달성률과 이월. 계산 단위 순서대로 ─────────── */
  /*
   * 이월은 곱셈이 계속 이어지는 점화식이라 어느 지점에서 정수로 끊느냐가 결과를 바꾼다.
   * 칸마다 반올림하면 오차가 이월을 타고 누적되어 총유입이 몇 원씩 밀린다.
   * 그래서 money.ts 와 같은 원칙을 쓴다 — **점화식은 정확하게 굴리고, 누적 실입금을 반올림해
   * 그 차이를 각 칸의 실입금으로 삼는다.** 보고되는 금액은 전부 정수 원이고,
   * 어느 구간에서도 누적 오차가 0.5원을 넘지 않는다.
   *
   *   실입금ₖ = round(누적계획ₖ − 이월ₖ) − round(누적계획ₖ₋₁ − 이월ₖ₋₁)
   *
   * (누적 실입금 = 누적 계획액 − 그 시점 이월. 점화식에서 그대로 따라 나온다.)
   */
  const rate = input.achievementRate;
  let carryExact = 0;
  let cumPlan = 0;
  let cumReceived = 0;
  for (const s of segments) {
    const available = s.planned + carryExact;
    carryExact = available * (1 - rate);
    cumPlan += s.planned;

    const upto = won(cumPlan - carryExact);
    s.received = upto - cumReceived;
    cumReceived = upto;
    s.carry = won(carryExact);
  }
  const unpaid = won(carryExact);

  const log = placeOutflows(input, segments, spans, horizon.start, horizon.end);

  /* ── R7 · 잔고 누적 ────────────────────────────────── */
  let cash = won(input.openingCash);
  for (const s of segments) {
    s.outflow = s.fixedCost + s.expense;
    s.net = s.received - s.outflow;
    s.openingCash = cash;
    cash += s.net;
    s.cash = cash;
  }

  /* ── 주 / 월 묶기 ──────────────────────────────────── */
  const weeks: Period[] = spans.map((w: WeekSpan) =>
    roll(
      segments.filter((s) => s.weekIndex === w.index),
      { code: w.code, label: w.label, month: w.month, monthWeek: w.monthWeek },
    ),
  );

  const order: string[] = [];
  const grouped = new Map<string, Segment[]>();
  for (const s of segments) {
    if (!grouped.has(s.month)) {
      grouped.set(s.month, []);
      order.push(s.month);
    }
    grouped.get(s.month)!.push(s);
  }
  const months: Period[] = order.map((m) => {
    const group = grouped.get(m)!;
    const p = roll(group, { code: m, label: '', month: m });
    p.label = rangeLabel(group[0]!.start, group[group.length - 1]!.end);
    p.weeks = [...new Set(group.map((s) => s.weekIndex))].map((i) => weeks[i]!);
    return p;
  });

  const min = weeks.reduce((acc, w) => (w.cash < acc.cash ? w : acc), weeks[0]!);
  const bottom = weeks.find((w) => w.cash < 0) ?? null;

  return {
    weeks,
    months,
    min,
    bottom,
    shortfall: Math.max(0, won(input.warnLine) - min.cash),
    unpaid,
    totalIn: weeks.reduce((s, w) => s + w.received, 0),
    totalOut: weeks.reduce((s, w) => s + w.outflow, 0),
    endCash: weeks[weeks.length - 1]!.cash,
    deferredOutOfRange: log.deferredOutOfRange,
    cancelled: log.cancelled,
  };
}
