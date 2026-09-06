import { daysInMonth, parseISO, toISO, utc } from './calendar';
import { won } from './money';
import { firstSegmentOfWeek, segmentIndexOf, type Segment, type WeekSpan } from './periods';
import type { CashflowInput, OutflowItem } from './types';

export interface OutflowLog {
  /** 기간 밖으로 밀려 연내 집행되지 않는 건 — 계산에서 빼고 기록만 남긴다 */
  deferredOutOfRange: OutflowItem[];
  /** 취소된 건 — 계산에서 빼고 기록만 남긴다 */
  cancelled: OutflowItem[];
}

/** R6 · 지출 배치 */
export function placeOutflows(
  input: CashflowInput,
  segments: Segment[],
  weeks: WeekSpan[],
  horizonStart: Date,
  horizonEnd: Date,
): OutflowLog {
  const inEntity = (e: string): boolean => input.entityFilter == null || e === input.entityFilter;
  const log: OutflowLog = { deferredOutOfRange: [], cancelled: [] };

  /* ── 고정비 · 매달 지급일에 ─────────────────────────── */
  const year = horizonStart.getUTCFullYear();
  const monthNos = [...new Set(segments.map((s) => parseInt(s.month, 10)))];

  for (const f of input.fixedCosts) {
    for (const m of monthNos) {
      // 지급일이 그 달 말일보다 크면 말일로.
      const d = utc(year, m - 1, Math.min(f.payDay, daysInMonth(year, m)));
      if (d < horizonStart || d > horizonEnd) continue;

      // 법인 필터가 걸리면 배분 비율을 곱한다.
      const share = input.entityFilter == null ? 1 : (f.shares[input.entityFilter] ?? 0);
      const amount = won(f.amount * share);
      if (amount <= 0) continue;

      const i = segmentIndexOf(segments, d);
      segments[i]!.fixedCost += amount;
      segments[i]!.outflows.push({
        kind: '고정비',
        name: f.item,
        entity: input.entityFilter ?? '전체',
        amount,
        date: toISO(d),
        placement: '집행',
      });
    }
  }

  /* ── 일회성 지출 ────────────────────────────────────── */
  for (const e of input.expenses) {
    const d = parseISO(e.date);
    if (d < horizonStart || d > horizonEnd) continue;
    if (!inEntity(e.entity)) continue;

    const amount = won(e.amount);
    const srcSeg = segmentIndexOf(segments, d);
    const base: Omit<OutflowItem, 'placement'> = {
      kind: '기타 지출',
      name: e.item,
      entity: e.entity,
      amount,
      date: e.date,
      expenseId: e.id,
    };

    if (e.execState === '취소') {
      const rec: OutflowItem = { ...base, placement: '취소' };
      segments[srcSeg]!.outflows.push(rec);
      log.cancelled.push(rec);
      continue;
    }

    if (e.execState === '연기') {
      const srcWeek = segments[srcSeg]!.weekIndex;
      let targetWeek: number;
      if (e.deferToWeek === 'out') {
        targetWeek = weeks.length + 99; // 연내 미집행
      } else if (e.deferToWeek) {
        const j = weeks.findIndex((w) => w.code === e.deferToWeek);
        // 과거로는 못 미룬다 — 뒤가 아니면 기본 지연 주수를 쓴다.
        targetWeek = j > srcWeek ? j : srcWeek + (input.assumptions.defaultDeferWeeks || 4);
      } else {
        targetWeek = srcWeek + (input.assumptions.defaultDeferWeeks || 4);
      }

      const t = targetWeek < weeks.length ? firstSegmentOfWeek(segments, targetWeek) : -1;
      const moved: OutflowItem = {
        ...base,
        placement: '연기',
        to: t >= 0 ? weeks[targetWeek]!.code : '기간 밖',
      };
      segments[srcSeg]!.outflows.push(moved);

      if (t >= 0) {
        segments[t]!.outflows.push({ ...base, placement: '이월', from: weeks[srcWeek]!.code });
        segments[t]!.expense += amount;
      } else {
        log.deferredOutOfRange.push(moved);
      }
      continue;
    }

    segments[srcSeg]!.outflows.push({ ...base, placement: '집행' });
    segments[srcSeg]!.expense += amount;
  }

  return log;
}
