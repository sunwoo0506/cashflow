import { addDays, endOfMonth, parseISO, toISO, utc } from './calendar';
import { splitByRatio, won } from './money';
import {
  inflowSegmentIndex,
  segmentIndexOf,
  type Segment,
} from './periods';
import type { CashflowInput, InflowItem } from './types';
import { isLiveOpportunity, winRateOf } from './winRate';

const push = (segments: Segment[], i: number, item: InflowItem): void => {
  if (item.amount <= 0) return;
  segments[i]!.inflows.push(item);
  segments[i]!.planned += item.amount;
};

/** 월 이름('8월')에서 월 번호를 뽑는다 */
const monthNo = (label: string): number => parseInt(label, 10);

/**
 * R3 · 유입 배치.
 * 소스 4개를 각각 켜고 끌 수 있고, R5(이중계산 방지)는 pipe 와 newSales 가 함께 켜질 때만 돈다.
 */
export function placeInflows(input: CashflowInput, segments: Segment[], horizonEnd: Date): void {
  const asOf = parseISO(input.asOf);
  const start = segments[0]!.start;
  const inEntity = (e: string): boolean => input.entityFilter == null || e === input.entityFilter;
  const a = input.assumptions;

  /* ── 확정 채권 · 수주 확정 ────────────────────────────── */
  for (const r of input.receivables) {
    if (!inEntity(r.entity)) continue;

    const isBilled = r.stage === '청구완료';
    if (isBilled) {
      if (!input.sources.ar) continue;
      if (r.status === 'collected') continue; // 다 받은 건은 들어올 돈이 없다
    } else {
      if (!input.sources.won) continue;
    }
    if (r.amountOpen <= 0) continue;

    /*
     * R3-b · 회수예정일이 없으면 현금흐름에 개별 건으로 넣지 않는다.
     * 기간 마지막 칸에 몰면 최저점 뒤에 큰돈이 들어와 런웨이가 실제보다 안전해 보인다.
     * 이 돈은 `assumptions.undatedReceivables` 가정으로 따로 배분한다.
     */
    if (!r.dueDate) continue;
    const due = parseISO(r.dueDate);
    push(segments, inflowSegmentIndex(segments, due, asOf), {
      kind: r.kind,
      source: isBilled ? 'ar' : 'won',
      name: r.counterparty,
      entity: r.entity,
      amount: won(r.amountOpen),
      assumed: false,
      dueEstimated: r.dueEstimated === true,
      date: toISO(due),
      overdue: due < asOf,
    });
  }

  /* ── R3-b · 회수예정일 없는 채권 배분 (확정 채권 가정) ─── */
  const undated = a.undatedReceivables;
  // 배분 비율이 비어 있으면 현금흐름에서 제외한다. 임의의 칸에 놓지 않는다.
  if (input.sources.ar && undated && Object.keys(undated.undatedAllocation).length > 0) {
    const pot = won(
      Math.max(0, undated.receivableTotal - undated.plannedDeduction) * undated.execRate,
    );

    // 법인별 몫은 지원사업 채권의 실제 비중으로 나눈다 (법인 필터와 무관하게 계산).
    const support = input.receivables.filter((r) => r.kind === '지원사업');
    const totalSupport = support.reduce((s, r) => s + r.amountOpen, 0);
    const entities = [...new Set(support.map((r) => r.entity))].sort();
    const byEntity = new Map<string, number>();
    for (const e of entities) {
      const own = support.filter((r) => r.entity === e).reduce((s, r) => s + r.amountOpen, 0);
      byEntity.set(e, totalSupport ? own / totalSupport : 1 / Math.max(1, entities.length));
    }

    // 월 → 그 달의 계산 단위들. 시간 순으로 쌓아 두면 splitByRatio 의 누적 반올림이
    // 그대로 잔고 순서와 맞는다. 합은 정확히 pot 이 된다.
    const targets: Array<{ segIndex: number; entity: string; ratio: number }> = [];
    for (const [month, ratio] of Object.entries(undated.undatedAllocation)) {
      const idxs = segments.map((s, i) => (s.month === month ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) continue;
      for (const segIndex of idxs) {
        for (const e of entities) {
          if (!inEntity(e)) continue;
          targets.push({ segIndex, entity: e, ratio: (ratio / idxs.length) * byEntity.get(e)! });
        }
      }
    }
    const amounts = splitByRatio(
      won(pot * targets.reduce((s, t) => s + t.ratio, 0)),
      targets.map((t) => t.ratio),
    );
    targets.forEach((t, k) => {
      push(segments, t.segIndex, {
        kind: '지원사업',
        source: 'ar',
        name: '잔여 채권 배분',
        entity: t.entity,
        amount: amounts[k]!,
        assumed: true,
        date: toISO(segments[t.segIndex]!.start),
      });
    });
  }

  /* ── 파이프라인 ─────────────────────────────────────── */
  /** R5 를 위해 달별 기대값을 같이 모은다 */
  const pipelineByMonth = new Map<number, number>();
  if (input.sources.pipe || input.sources.newSales) {
    for (const o of input.opportunities) {
      if (!inEntity(o.entity)) continue;
      if (!isLiveOpportunity(o)) continue;
      const expected = won(o.amountExpected * winRateOf(o));
      if (expected <= 0) continue;

      // R3-b · 예상 입금일이 없으면 언제 들어올지 모른다. 마지막 칸에 몰지 않는다.
      if (!o.expectedDate) continue;
      const due = parseISO(o.expectedDate);
      const m = due.getUTCMonth() + 1;
      pipelineByMonth.set(m, (pipelineByMonth.get(m) ?? 0) + expected);

      if (input.sources.pipe) {
        push(segments, inflowSegmentIndex(segments, due, asOf), {
          kind: '일반매출',
          source: 'pipe',
          name: o.name,
          entity: o.entity,
          amount: expected,
          assumed: true,
          date: toISO(due),
          winRate: winRateOf(o),
        });
      }
    }
  }

  /* ── 신규매출 가정 ──────────────────────────────────── */
  if (input.sources.newSales) {
    const rate = a.newSalesRate;
    const year = start.getUTCFullYear();

    // 기간 안에 실제로 배치되는 달만 추린다.
    const placeable: Array<{ month: string; target: number; due: Date }> = [];
    for (const [month, target] of Object.entries(a.newSalesTargets)) {
      const due = addDays(endOfMonth(utc(year, monthNo(month) - 1, 1)), a.newSalesLagDays);
      if (due < start || due > horizonEnd) continue;
      placeable.push({ month, target, due });
    }
    placeable.sort((x, y) => +x.due - +y.due);

    /**
     * R5 · 이중계산 방지 — **회수월** 기준으로 맞춘다.
     *
     * 맞춰야 하는 축은 매출이 난 달이 아니라 **현금이 들어오는 달**이다.
     * 이중계산은 "같은 시점에 현금이 두 번 잡히는 것"이지 "같은 달에 매출이 두 번 나는 것"이 아니다.
     *
     *   차감액 = pipeByMonth[그 행의 회수월] / 회수율
     *   순목표 = max(0, 월 목표 − 차감액)
     *   배치액 = 순목표 × 회수율        → 결국 (목표×회수율) − 기대값
     *
     * 매출월로 맞추면 안 된다. 이 픽스처에서 파이프라인은 11월·12월 회수인데,
     * 11월분·12월분 신규매출 행은 회수일이 내년이라 배치되지 않는다.
     * 매출월로 찾으면 차감이 통째로 사라지고, 회수월로 찾으면
     * 11월 → 9월분(회수 11/14) · 12월 → 10월분(회수 12/15) 에 정확히 걸린다.
     */
    const deduct = input.sources.pipe;
    const remaining = new Map(pipelineByMonth);

    const rows = placeable.map((p) => {
      const gross = won(p.target * rate);
      if (!deduct) return { ...p, gross, net: gross };

      const collectionMonth = p.due.getUTCMonth() + 1;
      // 한 회수월의 기대값을 여러 행이 중복해서 빼 가지 않도록 쓴 만큼 덜어 낸다.
      const take = Math.min(gross, remaining.get(collectionMonth) ?? 0);
      remaining.set(collectionMonth, (remaining.get(collectionMonth) ?? 0) - take);
      return { ...p, gross, net: gross - take };
    });

    /*
     * 잔여분 fallback · 파이프라인 회수월에 대응하는 신규매출 행이 아예 없으면 차감이 남는다.
     * 남은 몫은 배치되는 달 중 이른 순서대로 떠넘긴다 — 잔고 최저점이 더 일찍·더 낮게 나오는 쪽이
     * 안전한 오차다. 차감이 사라지게 두면 이중계산이 그대로 남는다.
     */
    if (deduct) {
      let debt = 0;
      for (const v of remaining.values()) debt += v;
      for (const r of rows) {
        if (debt <= 0) break;
        const take = Math.min(r.net, debt);
        r.net -= take;
        debt -= take;
      }
    }

    // 법인 배분. 필터가 걸리면 그 법인 몫만 남는다.
    const visible = Object.keys(a.newSalesShareByEntity).sort().filter(inEntity);
    const visibleShare = visible.reduce((s, e) => s + (a.newSalesShareByEntity[e] ?? 0), 0);

    for (const p of rows) {
      const net = p.net;
      if (net <= 0) continue;

      const shares = splitByRatio(
        won(net * visibleShare),
        visible.map((e) => a.newSalesShareByEntity[e] ?? 0),
      );
      visible.forEach((e, k) => {
        push(segments, segmentIndexOf(segments, p.due), {
          kind: '신규매출',
          source: 'newSales',
          name: `${p.month} 매출분 회수`,
          entity: e,
          amount: shares[k]!,
          assumed: true,
          date: toISO(p.due),
        });
      });
    }
  }
}
