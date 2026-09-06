import { parseISO } from './calendar';
import type { AgingBucket, AgingResult, EntityName, Receivable } from './types';

export const AGING_BUCKETS: readonly AgingBucket[] = [
  '정상',
  '30일',
  '60일',
  '90일',
  '90일초과',
  '회수예정일 미정',
] as const;

const zero = (): Record<AgingBucket, number> =>
  Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;

const bucketOf = (overdueDays: number): AgingBucket => {
  if (overdueDays <= 0) return '정상';
  if (overdueDays <= 30) return '30일';
  if (overdueDays <= 60) return '60일';
  if (overdueDays <= 90) return '90일';
  return '90일초과';
};

/**
 * R8 · 연령분석.
 * **잔액을 나눈다. 매출액을 나누지 않는다.**
 * `stage='청구전'` 은 제외한다 — 청구도 안 한 건에 연체는 의미가 없다.
 * 6개 버킷 합계 = 매출채권 총액이어야 한다.
 */
export function ageReceivables(
  receivables: Receivable[],
  asOf: string,
  options: { entityFilter?: EntityName | null; includeInternal?: boolean } = {},
): AgingResult {
  const at = parseISO(asOf);
  const buckets = zero();
  const byEntity: Record<EntityName, Record<AgingBucket, number>> = {};
  let total = 0;

  for (const r of receivables) {
    if (r.stage === '청구전') continue;
    if (options.entityFilter != null && r.entity !== options.entityFilter) continue;
    if (options.includeInternal === false && r.isInternal) continue;

    const b: AgingBucket = r.dueDate
      ? bucketOf(Math.round((at.getTime() - parseISO(r.dueDate).getTime()) / 86400000))
      : '회수예정일 미정';

    buckets[b] += r.amountOpen;
    total += r.amountOpen;
    (byEntity[r.entity] ??= zero())[b] += r.amountOpen;
  }

  return { buckets, total, byEntity };
}
