import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromLegacySeed, type CashflowInput, type LegacySeed } from '../src/index';

const path = fileURLToPath(new URL('../__fixtures__/demo-2026-08-13.json', import.meta.url));
export const SEED = JSON.parse(readFileSync(path, 'utf8')) as LegacySeed;

/**
 * 골든 테스트 기준 입력 (docs/05 · legacy DEF 와 같아야 한다).
 * 데이터는 scripts/make-fixture.mjs 가 만든 **가상 샘플**이다 (실제 거래 정보가 아니다).
 * asOf 2026-08-13 · 시작 2026-08-01 · 22주 · 기초 80,000,000 · 안전선 50,000,000.
 *
 * 기초는 80,000,000 이다. 71,500,000 은 기초가 아니라 W01 기말이자 min.cash —
 * W01(8/1~8/2)은 이틀짜리 주여서 유입이 없고 8/1 임차료 8,500,000 만 나간다.
 */
export function baseInput(over: Partial<CashflowInput> = {}): CashflowInput {
  const parts = fromLegacySeed(SEED);
  return {
    asOf: parts.asOf,
    startDate: '2026-08-01',
    weeks: 22,
    openingCash: 80_000_000,
    warnLine: 50_000_000,
    entityFilter: null,
    achievementRate: 1,
    sources: { ar: true, won: false, pipe: false, newSales: true },
    receivables: parts.receivables,
    opportunities: parts.opportunities,
    fixedCosts: parts.fixedCosts,
    expenses: parts.expenses,
    assumptions: parts.assumptions,
    ...over,
  };
}
