/**
 * 골든 픽스처로 만든 Dataset.
 *
 * 실서비스 화면은 `lib/data.ts` 가 회사(org)별로 DB 에서 읽는다.
 * 이 파일은 **화면 테스트**와 **시딩 스크립트**가 쓴다 — DB 없이도 같은 모양을 만들 수 있어야
 * 화면 숫자를 골든값과 대조할 수 있기 때문이다.
 */
import seedJson from '../../../packages/cashflow-engine/__fixtures__/demo-2026-08-13.json';
import {
  fromLegacySeed,
  legacyAgingLedger,
  type Expense,
  type FixedCost,
  type LegacySeed,
  type Opportunity,
  type Receivable,
  type Assumptions,
} from 'cashflow-engine';

export interface TopCounterparty {
  entity: string;
  counterparty: string;
  balance: number;
  isInternal: boolean;
}

/** 지원사업 정산 진행 (탭③ 3.5) */
export interface SupportSettlement {
  lines: number;
  /** 정산 청구액 */
  claimed: number;
  /** 수금 계획액 */
  planned: number;
  /** 실제 수령액 */
  received: number;
}

export interface Dataset {
  asOf: string;
  generatedFrom: string;
  /** 이 회사의 법인 이름들. 하드코딩하지 않는다 — 회사마다 다르다 */
  entities: string[];
  receivables: Receivable[];
  agingLedger: Receivable[];
  opportunities: Opportunity[];
  fixedCosts: FixedCost[];
  expenses: Expense[];
  assumptions: Assumptions;
  /** 매출채권 총액 — 연령분석 합계와 반드시 같아야 한다 */
  receivableTotal: number;
  byEntityKind: { entity: string; kind: string; amount: number }[];
  topCounterparties: TopCounterparty[];
  negativeBalances: TopCounterparty[];
  support: SupportSettlement;
  defaults: {
    startDate: string;
    weeks: number;
    openingCash: number;
    warnLine: number;
  };
}

const INTERNAL = new Set(['내부법인']);

let cached: Dataset | null = null;

export function getFixtureDataset(): Dataset {
  if (cached) return cached;

  // 번들에 포함시킨다. 런타임 파일 경로에 기대면 배포 환경에서 깨진다.
  const seed = seedJson as unknown as LegacySeed & {
    ar: {
      total: number;
      by_corp_kind: { 법인: string; 구분: string; 금액: number }[];
      top: { 법인: string; 거래처: string; 잔액: number }[];
      neg: { 법인: string; 거래처: string; 잔액: number }[];
    };
    jiwon: { lines: number; tax: number; plan: number; paid: number };
  };

  const parts = fromLegacySeed(seed);
  const map = (r: { 법인: string; 거래처: string; 잔액: number }): TopCounterparty => ({
    entity: r.법인,
    counterparty: r.거래처,
    balance: r.잔액,
    isInternal: INTERNAL.has(r.거래처),
  });

  cached = {
    asOf: parts.asOf,
    generatedFrom: `초기 데이터 ${seed.meta.generated}`,
    entities: [...new Set(parts.receivables.map((r) => r.entity))].sort(),
    receivables: parts.receivables,
    agingLedger: legacyAgingLedger(seed),
    opportunities: parts.opportunities,
    fixedCosts: parts.fixedCosts,
    expenses: parts.expenses,
    assumptions: parts.assumptions,
    receivableTotal: seed.ar.total,
    byEntityKind: seed.ar.by_corp_kind.map((r) => ({
      entity: r.법인,
      kind: r.구분,
      amount: r.금액,
    })),
    topCounterparties: seed.ar.top.map(map),
    negativeBalances: seed.ar.neg.map(map),
    support: {
      lines: seed.jiwon.lines,
      claimed: seed.jiwon.tax,
      planned: seed.jiwon.plan,
      received: seed.jiwon.paid,
    },
    defaults: {
      startDate: '2026-08-01',
      weeks: 22,
      openingCash: 80_000_000,
      warnLine: 50_000_000,
    },
  };
  return cached;
}
