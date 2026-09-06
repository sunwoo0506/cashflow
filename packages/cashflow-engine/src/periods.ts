import {
  addDays,
  dowMon0,
  majorityMonth,
  monthLabel,
  parseISO,
  rangeLabel,
  toISO,
  utc,
  weekOfMonth,
} from './calendar';
import type { InflowItem, OutflowItem } from './types';

/** 화면에 나가는 한 주 */
export interface WeekSpan {
  index: number;
  code: string;
  start: Date;
  end: Date;
  month: string;
  monthWeek: number;
  label: string;
}

/** R2 · 실제 계산 단위 = 주 ∩ 달력 월 */
export interface Segment {
  weekIndex: number;
  month: string;
  start: Date;
  end: Date;

  planned: number;
  received: number;
  carry: number;
  fixedCost: number;
  expense: number;

  outflow: number;
  net: number;
  openingCash: number;
  cash: number;

  inflows: InflowItem[];
  outflows: OutflowItem[];
}

export interface Horizon {
  start: Date;
  end: Date;
  weeks: WeekSpan[];
  segments: Segment[];
}

/**
 * R1 · 주는 월요일 시작. 기간 끝은 min(시작 + weeks*7 − 1, 12/31).
 * 소속 달은 날이 더 많은 달, 주차 번호는 그 달 기준 달력 주차.
 */
export function buildWeeks(startDate: string, weeks: number): { start: Date; end: Date; spans: WeekSpan[] } {
  const start = parseISO(startDate);
  const cap = utc(start.getUTCFullYear(), 11, 31);
  let end = addDays(start, (weeks || 22) * 7 - 1);
  if (end > cap) end = cap;

  const spans: WeekSpan[] = [];
  let cursor = start;
  while (cursor <= end) {
    // 그 주의 일요일. 단, 기간 끝을 넘지 않는다 (첫 주·마지막 주는 잘린다).
    let wEnd = addDays(cursor, 6 - dowMon0(cursor));
    if (wEnd > end) wEnd = end;

    const maj = majorityMonth(cursor, wEnd);
    // 주차 번호는 '소속 달에 실제로 걸친 첫 날' 기준으로 매긴다.
    let rep = cursor;
    while (rep <= wEnd && !(rep.getUTCFullYear() === maj.y && rep.getUTCMonth() === maj.m0)) {
      rep = addDays(rep, 1);
    }
    if (rep > wEnd) rep = cursor;

    spans.push({
      index: spans.length,
      code: `W${String(spans.length + 1).padStart(2, '0')}`,
      start: cursor,
      end: wEnd,
      month: `${maj.m0 + 1}월`,
      monthWeek: weekOfMonth(rep),
      label: rangeLabel(cursor, wEnd),
    });
    cursor = addDays(wEnd, 1);
  }
  return { start, end, spans };
}

const emptySegment = (weekIndex: number, start: Date, end: Date): Segment => ({
  weekIndex,
  month: monthLabel(start),
  start,
  end,
  planned: 0,
  received: 0,
  carry: 0,
  fixedCost: 0,
  expense: 0,
  outflow: 0,
  net: 0,
  openingCash: 0,
  cash: 0,
  inflows: [],
  outflows: [],
});

/** R2 · 주를 달력 월 경계로 다시 쪼갠다. 월 경계에서 고정비 지급일이 어긋나는 것을 막는다. */
export function buildSegments(spans: WeekSpan[]): Segment[] {
  const segments: Segment[] = [];
  for (const w of spans) {
    let cursor = w.start;
    while (cursor <= w.end) {
      const monthEnd = utc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0);
      const segEnd = monthEnd < w.end ? monthEnd : w.end;
      segments.push(emptySegment(w.index, cursor, segEnd));
      cursor = addDays(segEnd, 1);
    }
  }
  return segments;
}

export function buildHorizon(startDate: string, weeks: number): Horizon {
  const { start, end, spans } = buildWeeks(startDate, weeks);
  return { start, end, weeks: spans, segments: buildSegments(spans) };
}

/** 날짜가 떨어지는 계산 단위. 기간보다 이르면 첫 칸, 늦으면 마지막 칸. */
export function segmentIndexOf(segments: Segment[], d: Date): number {
  if (d <= segments[0]!.start) return 0;
  for (let i = 0; i < segments.length; i++) {
    if (d >= segments[i]!.start && d <= segments[i]!.end) return i;
  }
  return segments.length - 1;
}

/**
 * R3 · 회수예정일이 기준일보다 과거이면 기준일이 속한 칸으로 당긴다.
 * 이미 늦은 돈은 지금 받는다고 본다.
 */
export function inflowSegmentIndex(segments: Segment[], due: Date, asOf: Date): number {
  return due < asOf ? segmentIndexOf(segments, asOf) : segmentIndexOf(segments, due);
}

/** 그 주에서 가장 이른 계산 단위 */
export function firstSegmentOfWeek(segments: Segment[], weekIndex: number): number {
  for (let i = 0; i < segments.length; i++) if (segments[i]!.weekIndex === weekIndex) return i;
  return -1;
}

export { toISO };
