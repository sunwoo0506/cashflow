/**
 * 계산 엔진 도메인 타입.
 * 순수 TypeScript. React·Supabase·fetch·Date.now() 를 쓰지 않는다.
 * 날짜는 전부 'YYYY-MM-DD' 문자열, 금액은 전부 정수 원 단위.
 */

/** 법인 이름. 데이터마다 표기가 흔들리므로 엔진은 문자열로만 다룬다. */
export type EntityName = string;

/** 구분 — 무엇을 파는가 */
export type ReceivableKind = '일반매출' | '지원사업';

/** 청구상태 — 세금계산서를 끊었는가 (사람이 고른다) */
export type ReceivableStage = '청구전' | '청구완료';

/** 현재상태 — 얼마나 받았는가 (수금 이력에서 자동 판정) */
export type ReceivableStatus = 'open' | 'partial' | 'collected';

/** 영업단계 */
export type SalesStage = '상담' | '견적' | '협상' | '수주확정' | '실주' | '보류';

/** 일회성 지출의 집행상태 */
export type ExecState = '집행' | '연기' | '취소';

export interface Receivable {
  id: string;
  entity: EntityName;
  /** 거래처 (입금처) */
  counterparty: string;
  kind: ReceivableKind;
  stage: ReceivableStage;
  status: ReceivableStatus;
  /** 잔액 = 청구금액 − 받은 금액 */
  amountOpen: number;
  /** 회수예정일. 모르면 null */
  dueDate: string | null;
  /** 회수예정일을 회전일로 추정했는가 (규칙 4 · UI 에 그렇게 표시한다) */
  dueEstimated?: boolean;
  /** 그룹 내부 채권 — 외부 채권 집계에서 뺀다 */
  isInternal?: boolean;
  manager?: string;
  turnDays?: number;
}

export interface Opportunity {
  id: string;
  entity: EntityName;
  name: string;
  salesStage: SalesStage;
  category?: string;
  amountExpected: number;
  /** 담당자가 직접 적은 확률. 비워 두는 게 정상 */
  winRateOverride?: number | null;
  /** 예상 입금일 */
  expectedDate: string | null;
}

export interface FixedCost {
  id: string;
  item: string;
  amount: number;
  /** 매달 지급일 (1~31). 그 달 말일보다 크면 말일로 */
  payDay: number;
  /** 법인별 배분 비율. 합계 1 */
  shares: Record<EntityName, number>;
  /**
   * 달마다 집행 상태를 달리 둘 수 있다. 키는 '8월' 같은 달 이름.
   *
   * 고정비라도 그 달에 미루거나 건너뛰는 일이 있다. 비워 두면 「집행」이다 —
   * 즉 이 값이 없으면 지금까지와 똑같이 매달 그대로 나간다.
   */
  monthlyState?: Record<string, { execState: ExecState; deferToWeek?: string | null }>;
}

/**
 * 일회성 지출.
 * legacy 가 붙여 두는 `on` 은 `run()` 이 한 번도 읽지 않는 죽은 필드다.
 * 집행 여부는 전적으로 `execState` 가 결정한다 — 타입에 두지 않는다.
 */
export interface Expense {
  id: string;
  item: string;
  date: string;
  amount: number;
  entity: EntityName;
  execState: ExecState;
  /** '연기' 일 때 옮겨 갈 주차 코드. 'out' = 연내 미집행, null = 기본 지연 주수 */
  deferToWeek?: string | null;
  category?: string;
}

/**
 * R3-b · 회수예정일이 없는 채권을 현금흐름에 넣는 가정.
 *
 * 연령분석은 잔액 전액을 「회수예정일 미정」 버킷에 넣지만, 현금흐름에는
 * `(잔여채권 − 계획분) × 집행률` 만 넣는다 — 실제로 받을 것 같은 몫만 보기 위해서다.
 * 두 값이 다른 것은 정상이다. 모수도 다르고 집행률 반영 여부도 다르다.
 */
export interface UndatedReceivables {
  /** 잔여 채권 총액 */
  receivableTotal: number;
  /** 그중 세금 등으로 빠질 계획분 */
  plannedDeduction: number;
  /** 집행률 */
  execRate: number;
  /** 월별 배분 비율 — { '9월': 0.25, … }. **비어 있으면 현금흐름에서 제외한다** */
  undatedAllocation: Record<string, number>;
}

export interface Assumptions {
  /** 월별 신규매출 목표 — { '8월': 120000000, … } */
  newSalesTargets: Record<string, number>;
  /** 신규매출 회수율 */
  newSalesRate: number;
  /** 월말 이후 회수까지 지연 일수 */
  newSalesLagDays: number;
  /** 신규매출 중 법인A 몫. 나머지는 법인B */
  newSalesShareByEntity: Record<EntityName, number>;
  /** 일회성 지출 '연기' 의 기본 지연 주수 */
  defaultDeferWeeks: number;
  undatedReceivables?: UndatedReceivables;
}

export interface CashflowInput {
  /** 'YYYY-MM-DD' 기준일. 절대 Date.now() 를 쓰지 않는다 */
  asOf: string;
  startDate: string;
  /** 최대 주 수 (12/31 을 넘지 않는다) */
  weeks: number;
  openingCash: number;
  /** 안전선 */
  warnLine: number;
  /** null = 전체 통합 */
  entityFilter: EntityName | null;
  /** 달성률 0~1 */
  achievementRate: number;
  sources: { ar: boolean; won: boolean; pipe: boolean; newSales: boolean };

  receivables: Receivable[];
  opportunities: Opportunity[];
  fixedCosts: FixedCost[];
  expenses: Expense[];
  assumptions: Assumptions;
}

/** 유입 한 건 */
export interface InflowItem {
  kind: ReceivableKind | '신규매출';
  source: 'ar' | 'won' | 'pipe' | 'newSales';
  name: string;
  entity: EntityName;
  amount: number;
  /** 가정으로 만들어 낸 값인가 (규칙 4) */
  assumed: boolean;
  /** 회수예정일을 추정했는가 */
  dueEstimated?: boolean;
  date: string;
  /** 기준일보다 늦은 건 */
  overdue?: boolean;
  /** 파이프라인에 적용된 확률 */
  winRate?: number;
}

/** 지출 한 건 */
export interface OutflowItem {
  kind: '고정비' | '기타 지출';
  name: string;
  entity: EntityName;
  amount: number;
  date: string;
  /** 이 칸에서 무슨 일이 일어났는가 */
  placement: '집행' | '연기' | '이월' | '취소';
  /** '연기' 일 때 옮겨 간 곳 */
  to?: string;
  /** '이월' 일 때 원래 있던 곳 */
  from?: string;
  expenseId?: string;
}

export interface Period {
  code: string;
  label: string;
  /** '8월' 같은 소속 달 */
  month: string;
  /** 그 달 기준 몇 번째 주인가 (주 단위에만) */
  monthWeek?: number;
  start: string;
  end: string;

  /** 계획액 */
  planned: number;
  /** 실입금 = 가용 × 달성률 */
  received: number;
  /** 다음 칸으로 넘어가는 이월 */
  carry: number;

  fixedCost: number;
  expense: number;
  outflow: number;
  net: number;

  openingCash: number;
  cash: number;

  inflows: InflowItem[];
  outflows: OutflowItem[];
  /** 월 단위에만 — 그 달에 속한 주들 */
  weeks?: Period[];
}

export interface CashflowResult {
  weeks: Period[];
  months: Period[];
  /** 잔고 최저 주차 */
  min: Period;
  /** 처음으로 잔고 < 0 이 되는 주차 */
  bottom: Period | null;
  /** max(0, 안전선 − 최저 잔고) */
  shortfall: number;
  /** 기간 말 미회수 이월 */
  unpaid: number;
  totalIn: number;
  totalOut: number;
  endCash: number;
  /** 기간 밖으로 밀려나 연내 집행되지 않는 일회성 지출 */
  deferredOutOfRange: OutflowItem[];
  /** 계산에서 제외된 취소 건 (기록만 남긴다) */
  cancelled: OutflowItem[];
}

/** 연령분석 버킷 */
export type AgingBucket = '정상' | '30일' | '60일' | '90일' | '90일초과' | '회수예정일 미정';

export interface AgingResult {
  buckets: Record<AgingBucket, number>;
  total: number;
  byEntity: Record<EntityName, Record<AgingBucket, number>>;
}
