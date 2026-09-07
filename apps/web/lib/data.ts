import 'server-only';
import { buildWeeks, type Assumptions, type Expense, type FixedCost, type Opportunity, type Receivable } from 'cashflow-engine';
import { createClient } from '@/lib/supabase/server';
import type { Dataset, SupportSettlement, TopCounterparty } from '@/lib/fixture-dataset';

export type { Dataset } from '@/lib/fixture-dataset';

/** 회사에 아직 가정값이 없을 때 쓰는 값 */
const DEFAULT_ASSUMPTIONS: Omit<Assumptions, 'newSalesShareByEntity'> = {
  newSalesTargets: {},
  newSalesRate: 0.9,
  newSalesLagDays: 45,
  defaultDeferWeeks: 4,
};

// 가정값을 아직 안 넣은 회사는 그 해 1년을 통째로 본다.
// 엔진이 12/31 에서 끊으므로 53주를 주면 연말까지 딱 맞는다.
const DEFAULTS = { weeks: 53, openingCash: 0, warnLine: 0 };

/** 오늘 날짜를 기준일로 쓴다. 엔진에는 인자로만 넘어간다 (엔진은 Date.now() 를 모른다). */
const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** 기간 시작 기본값 — 기준일이 속한 해의 1월 1일 */
const defaultStart = (asOf: string): string => `${asOf.slice(0, 4)}-01-01`;

interface Row {
  [k: string]: unknown;
}

/**
 * 회사(org) 하나의 자금 데이터를 통째로 읽는다.
 *
 * 데이터를 한 회사로 고정하지 않는다 — 로그인한 사람이 보고 있는 회사의 것만 읽고,
 * RLS 가 그걸 서버에서 한 번 더 강제한다.
 */
export async function getOrgDataset(orgId: string): Promise<Dataset> {
  const supabase = await createClient();

  const [entitiesRes, cpRes, recRes, oppRes, fcRes, expRes, asmRes, projRes, runRes] =
    await Promise.all([
    supabase.from('entities').select('id, name, short_name').eq('org_id', orgId),
    supabase
      .from('counterparties')
      .select('id, name, is_internal')
      .eq('org_id', orgId),
    supabase
      .from('receivables')
      .select(
        'id, entity_id, counterparty_id, project_id, kind, stage, issued_on, due_on, terms_days, amount_billed, amount_collected, amount_open, status',
      )
      .eq('org_id', orgId),
    supabase
      .from('opportunities')
      .select(
        'id, entity_id, counterparty_name, title, stage, product_category, amount_expected, win_rate, win_rate_override, expected_due_on',
      )
      .eq('org_id', orgId),
    supabase
      .from('fixed_costs')
      .select('id, item, account_code, monthly_amount, pay_day, fixed_cost_shares(entity_id, share)')
      .eq('org_id', orgId),
    supabase
      .from('expenses')
      .select('id, entity_id, item, category, planned_on, amount, exec_state, deferred_to, approval_state')
      .eq('org_id', orgId),
    supabase
      .from('assumption_sets')
      .select('start_date, weeks, opening_cash, warn_line, params, report_periods(as_of)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('projects')
      .select('id, name, end_date, settlement_due')
      .eq('org_id', orgId),
    supabase
      .from('fixed_cost_runs')
      .select('fixed_cost_id, month_start, exec_state, deferred_to')
      .eq('org_id', orgId),
  ]);

  const entityById = new Map<string, string>();
  for (const e of (entitiesRes.data ?? []) as Row[]) {
    entityById.set(e.id as string, e.name as string);
  }
  const cpById = new Map<string, { name: string; internal: boolean }>();
  for (const c of (cpRes.data ?? []) as Row[]) {
    cpById.set(c.id as string, {
      name: c.name as string,
      internal: Boolean(c.is_internal),
    });
  }

  /* ── 가정값 ────────────────────────────────────────────────── */
  const asm = ((asmRes.data ?? [])[0] ?? null) as Row | null;
  const params = (asm?.params ?? {}) as Partial<Assumptions>;
  const entityNames = [...entityById.values()];
  const evenShare = entityNames.length
    ? Object.fromEntries(entityNames.map((n) => [n, 1 / entityNames.length]))
    : {};

  const assumptions: Assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    newSalesShareByEntity: evenShare,
    ...params,
  };

  /*
   * 기준일은 「오늘」이 아니라 **보고 회차의 날짜**다.
   * 회차가 붙어 있지 않을 때만 오늘로 본다.
   *
   * 오늘로 고정하면, 지난 시점을 떠 놓은 자료를 열었을 때
   * 그 사이에 지난 회수예정일이 전부 「연체」로 당겨져 없던 위험이 만들어진다.
   */
  const period = (asm?.report_periods ?? null) as { as_of?: string } | null;
  const asOf = period?.as_of ?? todayISO();
  const startDate = (asm?.start_date as string | undefined) ?? defaultStart(asOf);
  const weeks = (asm?.weeks as number | undefined) ?? DEFAULTS.weeks;
  const openingCash = Number(asm?.opening_cash ?? DEFAULTS.openingCash);
  const warnLine = Number(asm?.warn_line ?? DEFAULTS.warnLine);

  const { spans } = buildWeeks(startDate, weeks);
  const isoOf = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const periodStart = spans.length ? isoOf(spans[0]!.start) : startDate;
  const periodEnd = spans.length ? isoOf(spans[spans.length - 1]!.end) : startDate;

  /* ── 채권 ──────────────────────────────────────────────────── */
  const LIVE = new Set(['open', 'partial']);
  const rawRec = ((recRes.data ?? []) as Row[]).filter((r) => LIVE.has(r.status as string));

  const receivables: Receivable[] = rawRec.map((r) => {
    const cp = cpById.get(r.counterparty_id as string);
    return {
      id: r.id as string,
      entity: entityById.get(r.entity_id as string) ?? '(알 수 없음)',
      counterparty: cp?.name ?? '(알 수 없음)',
      kind: (r.kind as Receivable['kind']) ?? '일반매출',
      // stage 는 0002 에서 추가된 컬럼이다 (청구전 / 청구완료).
      // 값이 없는 옛 행만 「세금계산서를 끊었는가」 = issued_on 유무로 채운다.
      stage: (r.stage as Receivable['stage']) ?? (r.issued_on ? '청구완료' : '청구전'),
      status: (r.status as Receivable['status']) ?? 'open',
      amountOpen: Math.round(Number(r.amount_open ?? 0)),
      dueDate: (r.due_on as string | null) ?? null,
      // due_on 은 not null 이고 「추정하지 않고 받는다」가 스키마의 뜻이다
      dueEstimated: false,
      isInternal: cp?.internal ?? false,
      turnDays: (r.terms_days as number | undefined) ?? undefined,
    };
  });

  /* ── 파이프라인 ────────────────────────────────────────────── */
  const opportunities: Opportunity[] = ((oppRes.data ?? []) as Row[]).map((o) => ({
    id: o.id as string,
    entity: entityById.get(o.entity_id as string) ?? '(알 수 없음)',
    name: (o.title as string) ?? (o.counterparty_name as string) ?? '(건명 없음)',
    salesStage: o.stage as Opportunity['salesStage'],
    category: (o.product_category as string | null) ?? undefined,
    amountExpected: Math.round(Number(o.amount_expected ?? 0)),
    winRateOverride:
      o.win_rate_override == null ? null : Number(o.win_rate_override),
    expectedDate: (o.expected_due_on as string | null) ?? null,
  }));

  // deferred_to 는 날짜다. 엔진은 주차 코드를 받으므로 같은 규칙으로 주를 찾아 넘긴다.
  const weekCodeOf = (iso: string): string | null => {
    const found = spans.find((w) => iso >= isoOf(w.start) && iso <= isoOf(w.end));
    return found ? found.code : 'out'; // 기간 밖이면 연내 미집행
  };

  /* ── 고정비 ────────────────────────────────────────────────── */
  /* 고정비의 달별 집행 기록. 행이 없으면 「집행」이다 — 평소엔 아무것도 안 적는다. */
  const runsByCost = new Map<string, Record<string, { execState: Expense['execState']; deferToWeek?: string | null }>>();
  for (const r of (runRes.data ?? []) as Row[]) {
    const id = r.fixed_cost_id as string;
    const month = `${Number(String(r.month_start).slice(5, 7))}월`;
    const cur = runsByCost.get(id) ?? {};
    cur[month] = {
      execState: r.exec_state as Expense['execState'],
      deferToWeek: r.deferred_to ? weekCodeOf(r.deferred_to as string) : null,
    };
    runsByCost.set(id, cur);
  }

  const fixedCosts: FixedCost[] = ((fcRes.data ?? []) as Row[]).map((f) => {
    const shares: Record<string, number> = {};
    for (const s of (f.fixed_cost_shares ?? []) as Row[]) {
      const name = entityById.get(s.entity_id as string);
      if (name) shares[name] = Number(s.share ?? 0);
    }
    // 배분이 없으면 법인들에 고르게 나눈다
    if (Object.keys(shares).length === 0 && entityNames.length) {
      for (const n of entityNames) shares[n] = 1 / entityNames.length;
    }
    const monthlyState = runsByCost.get(f.id as string);
    return {
      id: f.id as string,
      item: f.item as string,
      amount: Math.round(Number(f.monthly_amount ?? 0)),
      payDay: Number(f.pay_day ?? 1),
      shares,
      ...(monthlyState ? { monthlyState } : {}),
    };
  });

  /* ── 일회성 지출 ───────────────────────────────────────────── */

  const expenses: Expense[] = ((expRes.data ?? []) as Row[]).map((e) => ({
    id: e.id as string,
    item: e.item as string,
    date: e.planned_on as string,
    amount: Math.round(Number(e.amount ?? 0)),
    entity: entityById.get(e.entity_id as string) ?? '(알 수 없음)',
    execState: e.exec_state as Expense['execState'],
    deferToWeek: e.deferred_to ? weekCodeOf(e.deferred_to as string) : null,
    category: (e.category as string | null) ?? undefined,
  }));

  /*
   * ── 지원사업 정산 시점 ─────────────────────────────────────
   * 임의의 월별 비율로 흩뿌리지 않고 **과제에서 계산한다.**
   *   정산 예정일(settlement_due) 이 있으면 그 날,
   *   없으면 협약 종료일(end_date) + 1개월.
   * 기간 밖으로 나가는 과제는 현금흐름에서 뺀다 — 내년에 들어올 돈을 올해 런웨이에 넣지 않는다.
   *
   * 과제에 날짜가 하나도 없으면 가정값(undatedAllocation)을 그대로 쓴다.
   */
  const plusOneMonth = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
    t.setUTCMonth(t.getUTCMonth() + 1);
    return t.toISOString().slice(0, 10);
  };

  const projects = ((projRes.data ?? []) as Row[]).map((p) => {
    const due =
      (p.settlement_due as string | null) ??
      (p.end_date ? plusOneMonth(p.end_date as string) : null);
    return { id: p.id as string, name: p.name as string, due };
  });

  // 과제별 남은 지원사업 채권으로 무게를 준다 (없으면 고르게)
  const weightByProject = new Map<string, number>();
  for (const r of rawRec) {
    if (r.kind !== '지원사업' || !r.project_id) continue;
    const k = r.project_id as string;
    weightByProject.set(k, (weightByProject.get(k) ?? 0) + Math.round(Number(r.amount_open ?? 0)));
  }

  const dated = projects.filter((p) => p.due && p.due >= periodStart && p.due <= periodEnd);
  let settlementByMonth: Record<string, number> | null = null;
  if (dated.length > 0) {
    const acc: Record<string, number> = {};
    let total = 0;
    for (const p of dated) {
      const w = weightByProject.get(p.id) ?? 1;
      const month = `${Number(p.due!.slice(5, 7))}월`;
      acc[month] = (acc[month] ?? 0) + w;
      total += w;
    }
    if (total > 0) {
      settlementByMonth = Object.fromEntries(
        Object.entries(acc).map(([m, w]) => [m, w / total]),
      );
    }
  }

  if (settlementByMonth && assumptions.undatedReceivables) {
    assumptions.undatedReceivables = {
      ...assumptions.undatedReceivables,
      undatedAllocation: settlementByMonth,
    };
  }

  /* ── 집계는 저장하지 않는다. 항상 행에서 뽑는다 (CLAUDE.md 규칙 3) ── */
  const billed = receivables.filter((r) => r.stage === '청구완료');
  const receivableTotal = billed.reduce((s, r) => s + r.amountOpen, 0);

  const kindMap = new Map<string, number>();
  for (const r of billed) {
    const k = `${r.entity} ${r.kind}`;
    kindMap.set(k, (kindMap.get(k) ?? 0) + r.amountOpen);
  }
  const byEntityKind = [...kindMap.entries()].map(([k, amount]) => {
    const [entity, kind] = k.split(' ');
    return { entity: entity!, kind: kind!, amount };
  });

  const cpMap = new Map<string, TopCounterparty>();
  for (const r of billed) {
    const k = `${r.entity} ${r.counterparty}`;
    const prev = cpMap.get(k);
    if (prev) prev.balance += r.amountOpen;
    else
      cpMap.set(k, {
        entity: r.entity,
        counterparty: r.counterparty,
        balance: r.amountOpen,
        isInternal: r.isInternal ?? false,
      });
  }
  const allCp = [...cpMap.values()];
  const topCounterparties = allCp
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);
  // amount_open 은 스키마상 음수가 될 수 없다 (amount_collected <= amount_billed).
  // 선수금·반품으로 잔액이 음수인 건은 지금 모델로 표현되지 않는다.
  const negativeBalances = allCp.filter((c) => c.balance < 0);

  const support: SupportSettlement = {
    lines: billed.filter((r) => r.kind === '지원사업').length,
    claimed: rawRec
      .filter((r) => r.kind === '지원사업')
      .reduce((s, r) => s + Math.round(Number(r.amount_billed ?? 0)), 0),
    // 「수금 계획액」은 별도 입력값이다. 스키마에 자리가 없어 청구액을 그대로 쓰지 않고 0 으로 둔다.
    planned: 0,
    received: rawRec
      .filter((r) => r.kind === '지원사업')
      .reduce((s, r) => s + Math.round(Number(r.amount_collected ?? 0)), 0),
  };

  return {
    asOf,
    generatedFrom: asm ? '가정값 기준' : '가정값이 아직 없습니다',
    entities: entityNames,
    receivables,
    // due_on 이 not null 이라 「회수예정일 미정」 행이 DB 에는 없다.
    agingLedger: billed,
    opportunities,
    fixedCosts,
    expenses,
    assumptions,
    receivableTotal,
    byEntityKind,
    topCounterparties,
    negativeBalances,
    support,
    defaults: { startDate, weeks, openingCash, warnLine },
  };
}
