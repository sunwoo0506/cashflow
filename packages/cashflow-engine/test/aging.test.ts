import { describe, expect, it } from 'vitest';
import { AGING_BUCKETS, ageReceivables, legacyAgingLedger } from '../src/index';
import { SEED } from './fixture';
import { GOLDEN as G } from './expected';

const AS_OF = '2026-08-13';
const ledger = legacyAgingLedger(SEED);

describe('G5 · 연령분석 — 잔액을 나눈다. 매출액이 아니다', () => {
  const r = ageReceivables(ledger, AS_OF);

  it.each(AGING_BUCKETS)('%s 버킷이 기준값과 같다', (bucket) => {
    expect(r.buckets[bucket]).toBe(G.g5.buckets[bucket]);
  });

  it('6개 버킷 합계 = 매출채권 총액 (어긋나면 실패)', () => {
    const sum = AGING_BUCKETS.reduce((s, b) => s + r.buckets[b], 0);
    expect(sum).toBe(G.g5.total);
    expect(r.total).toBe(G.g5.total);
    expect(sum).toBe(SEED.ar!.total);
  });

  it('청구 전 건은 연령분석에서 제외한다 — 청구도 안 한 건에 연체는 없다', () => {
    const withUnbilled = [
      ...ledger,
      {
        id: 'unbilled',
        entity: '법인A',
        counterparty: '아직 청구 안 한 건',
        kind: '일반매출' as const,
        stage: '청구전' as const,
        status: 'open' as const,
        amountOpen: 999_999_999,
        dueDate: '2026-01-01',
      },
    ];
    expect(ageReceivables(withUnbilled, AS_OF).total).toBe(G.g5.total);
  });

  it('회수예정일이 없는 건은 경과일을 따지지 않고 별도 버킷으로 간다', () => {
    expect(r.buckets['회수예정일 미정']).toBeGreaterThan(0);
    const dated = ledger.filter((x) => x.dueDate).reduce((s, x) => s + x.amountOpen, 0);
    expect(r.total - r.buckets['회수예정일 미정']).toBe(dated);
  });
});

describe('G6 · 회귀 방지', () => {
  const r = ageReceivables(ledger, AS_OF);

  it('60일 이상 경과 = 60일 + 90일 + 90일초과', () => {
    expect(r.buckets['60일'] + r.buckets['90일'] + r.buckets['90일초과']).toBe(G.g5.over60);
  });

  it('연령분석 총액이 매출액이 아니라 잔액이다', () => {
    // 매출액(청구금액 합)을 나누면 잔액 합보다 커진다. 그 값이 나오면 회귀다.
    const billedSum = ledger.reduce((s, x) => s + x.amountOpen, 0);
    expect(r.total).toBe(billedSum);
  });

  it('그룹 내부 채권은 외부 채권 집계에서 빠진다', () => {
    const internal = ledger.filter((x) => x.isInternal);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.reduce((s, x) => s + x.amountOpen, 0)).toBe(G.g5.internalTotal);

    const external = ageReceivables(ledger, AS_OF, { includeInternal: false });
    expect(external.total).toBe(G.g5.total - G.g5.internalTotal);
  });

  it('마이너스 잔액 건이 기록돼 있다 (선수금·반품)', () => {
    const neg = SEED.ar?.neg ?? [];
    expect(neg).toHaveLength(G.g5.negativeCount);
    expect(neg.reduce((s, x) => s + x['잔액'], 0)).toBe(G.g5.negativeSum);
    expect(G.g5.negativeSum).toBeLessThan(0);
  });
});
