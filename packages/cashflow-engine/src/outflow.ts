import { daysInMonth, parseISO, toISO, utc } from './calendar';
import { won } from './money';
import { firstSegmentOfWeek, segmentIndexOf, type Segment, type WeekSpan } from './periods';
import type { CashflowInput, ExecState, OutflowItem } from './types';

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

      const srcSeg = segmentIndexOf(segments, d);
      // 그 달에 미루거나 건너뛴 기록이 있으면 따른다. 없으면 그대로 집행.
      const state = f.monthlyState?.[`${m}월`];
      place(
        {
          kind: '고정비',
          name: f.item,
          entity: input.entityFilter ?? '전체',
          amount,
          date: toISO(d),
          expenseId: f.id,
        },
        srcSeg,
        state?.execState ?? '집행',
        state?.deferToWeek ?? null,
        'fixedCost',
      );
    }
  }

  /* ── 일회성 지출 ────────────────────────────────────── */
  for (const e of input.expenses) {
    const d = parseISO(e.date);
    if (d < horizonStart || d > horizonEnd) continue;
    if (!inEntity(e.entity)) continue;

    place(
      {
        kind: '기타 지출',
        name: e.item,
        entity: e.entity,
        amount: won(e.amount),
        date: e.date,
        expenseId: e.id,
      },
      segmentIndexOf(segments, d),
      e.execState,
      e.deferToWeek ?? null,
      'expense',
    );
  }

  return log;

  /**
   * 집행 · 연기 · 취소를 한 곳에서 처리한다.
   * 고정비와 일회성이 같은 규칙을 따라야 한다 — 따로 쓰면 언젠가 갈라진다.
   */
  function place(
    base: Omit<OutflowItem, 'placement'>,
    srcSeg: number,
    execState: ExecState,
    deferToWeek: string | null,
    bucket: 'fixedCost' | 'expense',
  ): void {
    if (base.amount <= 0) return;

    if (execState === '취소') {
      const rec: OutflowItem = { ...base, placement: '취소' };
      segments[srcSeg]!.outflows.push(rec);
      log.cancelled.push(rec);
      return;
    }

    if (execState === '연기') {
      const srcWeek = segments[srcSeg]!.weekIndex;
      let targetWeek: number;
      if (deferToWeek === 'out') {
        targetWeek = weeks.length + 99; // 연내 미집행
      } else if (deferToWeek) {
        const j = weeks.findIndex((w) => w.code === deferToWeek);
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
        segments[t]![bucket] += base.amount;
      } else {
        log.deferredOutOfRange.push(moved);
      }
      return;
    }

    segments[srcSeg]!.outflows.push({ ...base, placement: '집행' });
    segments[srcSeg]![bucket] += base.amount;
  }
}
