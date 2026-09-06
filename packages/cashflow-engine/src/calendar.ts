/**
 * 달력 유틸. 전부 UTC 기준으로만 계산한다 —
 * 로컬 타임존·서머타임에 따라 결과가 달라지면 골든 테스트가 기계마다 다르게 나온다.
 */

const DAY = 86400000;
const p2 = (n: number) => String(n).padStart(2, '0');

export function parseISO(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

export const toISO = (d: Date): string =>
  `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;

export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);

export const utc = (y: number, m0: number, day: number): Date => new Date(Date.UTC(y, m0, day));

/** 그 달의 말일 */
export const endOfMonth = (d: Date): Date => utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);

/** m1 은 1~12 */
export const daysInMonth = (y: number, m1: number): number => utc(y, m1, 0).getUTCDate();

/** 월=0 … 일=6 */
export const dowMon0 = (d: Date): number => (d.getUTCDay() + 6) % 7;

/** 그 주의 월요일 */
export const mondayOf = (d: Date): Date => addDays(d, -dowMon0(d));

/** 그 달의 몇 번째 주인가 — 달력 기준 (1일이 있는 주가 1주차) */
export const weekOfMonth = (d: Date): number =>
  Math.ceil((d.getUTCDate() + dowMon0(utc(d.getUTCFullYear(), d.getUTCMonth(), 1))) / 7);

/** '8월' 꼴 */
export const monthLabel = (d: Date): string => `${d.getUTCMonth() + 1}월`;

/** '8/1~8/2' 꼴 */
export const rangeLabel = (a: Date, b: Date): string =>
  `${a.getUTCMonth() + 1}/${a.getUTCDate()}~${b.getUTCMonth() + 1}/${b.getUTCDate()}`;

/**
 * R1 · 한 주가 두 달에 걸치면 날이 더 많은 달에 소속시킨다.
 * 같으면 앞선 달이 이긴다 (키를 순서대로 훑고 > 로만 갱신).
 */
export function majorityMonth(start: Date, end: Date): { y: number; m0: number } {
  const count = new Map<string, number>();
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const k = `${d.getUTCFullYear()}|${d.getUTCMonth()}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let best = `${start.getUTCFullYear()}|${start.getUTCMonth()}`;
  let bv = -1;
  for (const [k, v] of count) {
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  const [y, m0] = best.split('|').map(Number);
  return { y: y as number, m0: m0 as number };
}
