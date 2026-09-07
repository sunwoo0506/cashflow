/**
 * legacy/index.html 의 내장 시드를 도메인 모델로 옮긴다.
 * 프로토타입 JSON 을 그대로 골든 테스트 입력으로 쓰기 위한 어댑터다.
 * 순수 함수 — 파일을 읽지 않고 이미 파싱된 객체만 받는다.
 */
import type {
  Assumptions,
  Expense,
  FixedCost,
  Opportunity,
  Receivable,
  SalesStage,
} from '../types';

export interface LegacySeed {
  meta: { generated: string; opening?: number };
  inflowGen: Array<{ corp: string; name: string; mgr?: string; turn?: number; amt: number; due: string; od?: boolean }>;
  inflowJw: Array<{ corp: string; name: string; biz?: string; amt: number; due: string }>;
  jwAR: number;
  jwPlanTax: number;
  execRate: number;
  fixed: Array<{ item: string; amt: number; day: number; share?: number }>;
  // `on` 은 legacy 가 붙여 두지만 run() 이 읽지 않는 죽은 필드라 옮기지 않는다.
  oneoff: Array<{
    item: string;
    date: string;
    amt: number;
    corp?: string;
    id?: string;
    /** 성격 — 제출 양식에서 받는 값 */
    cat?: string;
  }>;
  /** 매출채권 집계. 프로토타입은 총액만 갖고 개별 행은 회수예정일이 있는 건만 갖는다. */
  ar?: { total: number; neg?: Array<{ 법인: string; 거래처: string; 잔액: number }> };
  __demo_pipeline__?: Array<{ corp: string; name: string; stage: string; cat?: string; amt: number; due: string; rate?: number }>;
  __demo_won__?: Array<{ corp: string; name: string; cat?: string; amt: number; due: string }>;
}

export const ZEUS = '법인A';
export const NONGBEOP = '법인B';

/**
 * 그룹 내부 거래처 — 법인B가 법인A에게 받을 돈.
 * 밖에서 받을 돈으로 세면 안 된다 (docs/03: counterparties.is_internal).
 */
const INTERNAL_COUNTERPARTIES: ReadonlySet<string> = new Set(['내부법인']);

/** 프로토타입 기본 가정값 (legacy/index.html 의 DEF) */
export function legacyAssumptions(seed: LegacySeed): Assumptions {
  return {
    newSalesTargets: {
      '8월': 120000000,
      '9월': 140000000,
      '10월': 150000000,
      '11월': 130000000,
      '12월': 100000000,
    },
    newSalesRate: 0.9,
    newSalesLagDays: 45,
    newSalesShareByEntity: { [ZEUS]: 0.2, [NONGBEOP]: 0.8 },
    defaultDeferWeeks: 4,
    undatedReceivables: {
      receivableTotal: seed.jwAR,
      plannedDeduction: seed.jwPlanTax,
      execRate: seed.execRate,
      undatedAllocation: { '9월': 0.25, '10월': 0.3, '11월': 0.25, '12월': 0.2 },
    },
  };
}

/**
 * 확정 채권(청구완료) + 수주 확정(청구전).
 * 프로토타입은 회수예정일을 회전일로 추정해 넣은 값이라 `dueEstimated` 를 세워 둔다 (규칙 4).
 */
export function legacyReceivables(seed: LegacySeed): Receivable[] {
  const out: Receivable[] = [];

  seed.inflowGen.forEach((r, i) => {
    out.push({
      id: `gen-${i}`,
      entity: r.corp,
      counterparty: r.name,
      kind: '일반매출',
      stage: '청구완료',
      status: 'open',
      amountOpen: r.amt,
      dueDate: r.due,
      dueEstimated: true,
      isInternal: INTERNAL_COUNTERPARTIES.has(r.name),
      manager: r.mgr,
      turnDays: r.turn,
    });
  });

  seed.inflowJw.forEach((r, i) => {
    out.push({
      id: `jw-${i}`,
      entity: r.corp,
      counterparty: r.name,
      kind: '지원사업',
      stage: '청구완료',
      status: 'open',
      amountOpen: r.amt,
      dueDate: r.due,
      dueEstimated: true,
    });
  });

  (seed.__demo_won__ ?? []).forEach((r, i) => {
    out.push({
      id: `won-${i}`,
      entity: r.corp,
      counterparty: r.name,
      kind: '일반매출',
      stage: '청구전', // 수주는 했고 아직 청구는 안 한 건
      status: 'open',
      amountOpen: r.amt,
      dueDate: r.due,
    });
  });

  return out;
}

export function legacyOpportunities(seed: LegacySeed): Opportunity[] {
  return (seed.__demo_pipeline__ ?? []).map((o, i) => ({
    id: `pipe-${i}`,
    entity: o.corp,
    name: o.name,
    salesStage: o.stage as SalesStage,
    category: o.cat,
    amountExpected: o.amt,
    winRateOverride: o.rate ?? null,
    expectedDate: o.due,
  }));
}

export function legacyFixedCosts(seed: LegacySeed): FixedCost[] {
  return seed.fixed.map((f, i) => {
    const share = f.share == null ? 0.5 : f.share;
    return {
      id: `fx-${i}`,
      item: f.item,
      amount: f.amt,
      payDay: f.day,
      shares: { [ZEUS]: share, [NONGBEOP]: 1 - share },
    };
  });
}

export function legacyExpenses(seed: LegacySeed): Expense[] {
  return seed.oneoff.map((o, i) => ({
    id: o.id ?? `i${i}`,
    item: o.item,
    date: o.date,
    amount: o.amt,
    entity: o.corp ?? ZEUS,
    execState: '집행',
    category: o.cat,
  }));
}

/**
 * 연령분석용 매출채권 원장.
 *
 * 프로토타입은 **회수예정일이 있는 건만** 행으로 들고 있고 (inflowGen · inflowJw),
 * 나머지는 `ar.total` 이라는 총액으로만 갖고 있다. 그래서 그 차액을
 * 「회수예정일 미정」 한 건으로 되살려 6개 버킷 합계 = 매출채권 총액을 지킨다 (R8).
 *
 * 실제 스키마에서는 `receivables` 한 테이블에서 그대로 뽑으므로 이 되살리기가 필요 없다.
 */
export function legacyAgingLedger(seed: LegacySeed): Receivable[] {
  const dated = legacyReceivables(seed).filter((r) => r.stage === '청구완료');
  const ledger = [...dated];

  const total = seed.ar?.total;
  if (total != null) {
    const undated = total - dated.reduce((s, r) => s + r.amountOpen, 0);
    if (undated !== 0) {
      ledger.push({
        id: 'ar-undated',
        entity: '전체',
        counterparty: '회수예정일 미정 잔여분',
        kind: '일반매출',
        stage: '청구완료',
        status: 'open',
        amountOpen: undated,
        dueDate: null,
      });
    }
  }
  return ledger;
}

export interface LegacySeedParts {
  asOf: string;
  receivables: Receivable[];
  opportunities: Opportunity[];
  fixedCosts: FixedCost[];
  expenses: Expense[];
  assumptions: Assumptions;
}

export function fromLegacySeed(seed: LegacySeed): LegacySeedParts {
  return {
    asOf: seed.meta.generated,
    receivables: legacyReceivables(seed),
    opportunities: legacyOpportunities(seed),
    fixedCosts: legacyFixedCosts(seed),
    expenses: legacyExpenses(seed),
    assumptions: legacyAssumptions(seed),
  };
}
