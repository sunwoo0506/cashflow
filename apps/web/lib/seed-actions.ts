'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getFixtureDataset } from '@/lib/fixture-dataset';

export interface SeedResult {
  ok: boolean;
  message: string;
}

/**
 * 샘플 데이터를 지금 보고 있는 회사에 넣는다.
 *
 * 기능을 눌러 보려면 데이터가 있어야 하는데, 실제 원장을 올리기 전에는 화면이 비어 있다.
 * 그래서 **가상 샘플**(scripts/make-fixture.mjs 가 만든 것)을 한 번에 넣는 길을 둔다.
 * 실제 거래 정보가 아니다.
 */
export async function applySampleData(orgId: string): Promise<SeedResult> {
  const supabase = await createClient();
  const data = getFixtureDataset();

  // 이미 데이터가 있으면 덮지 않는다 — 실제 원장을 지우면 안 된다
  const { count } = await supabase
    .from('receivables')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: `이미 채권 ${count}건이 있습니다. 빈 회사에서만 넣을 수 있습니다`,
    };
  }

  try {
    /* 1) 법인 */
    const entityId = new Map<string, string>();
    for (const [i, name] of data.entities.entries()) {
      const { data: row, error } = await supabase
        .from('entities')
        .upsert({ org_id: orgId, name, sort_no: i }, { onConflict: 'org_id,name' })
        .select('id')
        .single();
      if (error) throw error;
      entityId.set(name, row.id as string);
    }

    /* 2) 거래처 — 그룹 내부 여부까지 */
    const names = [...new Set(data.receivables.map((r) => r.counterparty))];
    const internal = new Set(
      data.receivables.filter((r) => r.isInternal).map((r) => r.counterparty),
    );
    const someEntity = [...entityId.values()][0]!;
    const { data: cps, error: cpErr } = await supabase
      .from('counterparties')
      .upsert(
        names.map((name) => ({
          org_id: orgId,
          name,
          is_internal: internal.has(name),
          internal_entity_id: internal.has(name) ? someEntity : null,
        })),
        { onConflict: 'org_id,name' },
      )
      .select('id, name');
    if (cpErr) throw cpErr;
    const cpId = new Map((cps ?? []).map((c) => [c.name as string, c.id as string]));

    /* 3) 채권 — 청구완료는 발행일을 넣고, 청구전(수주확정)은 비운다 */
    const recRows = data.receivables
      .map((r) => {
        const e = entityId.get(r.entity);
        const c = cpId.get(r.counterparty);
        if (!e || !c || !r.dueDate) return null;
        return {
          org_id: orgId,
          entity_id: e,
          counterparty_id: c,
          kind: r.kind,
          issued_on: r.stage === '청구완료' ? r.dueDate : null,
          due_on: r.dueDate,
          amount_billed: r.amountOpen,
          amount_collected: 0,
          terms_days: r.turnDays ?? null,
        };
      })
      .filter(Boolean);
    if (recRows.length) {
      const { error } = await supabase.from('receivables').insert(recRows as object[]);
      if (error) throw error;
    }

    /* 4) 파이프라인 */
    const oppRows = data.opportunities
      .map((o) => {
        const e = entityId.get(o.entity);
        if (!e || !o.expectedDate) return null;
        return {
          org_id: orgId,
          entity_id: e,
          kind: '일반매출',
          title: o.name,
          stage: o.salesStage,
          amount_expected: o.amountExpected,
          win_rate_override: o.winRateOverride ?? null,
          expected_due_on: o.expectedDate,
          product_name: o.category ?? null,
        };
      })
      .filter(Boolean);
    if (oppRows.length) {
      const { error } = await supabase.from('opportunities').insert(oppRows as object[]);
      if (error) throw error;
    }

    /* 5) 고정비 + 법인 배분 */
    for (const f of data.fixedCosts) {
      const { data: fc, error } = await supabase
        .from('fixed_costs')
        .insert({
          org_id: orgId,
          item: f.item,
          monthly_amount: f.amount,
          pay_day: f.payDay,
          effective_from: data.defaults.startDate,
        })
        .select('id')
        .single();
      if (error) throw error;

      const shares = Object.entries(f.shares)
        .map(([name, share]) => {
          const eid = entityId.get(name);
          return eid ? { fixed_cost_id: fc.id, entity_id: eid, share } : null;
        })
        .filter(Boolean);
      if (shares.length) await supabase.from('fixed_cost_shares').insert(shares as object[]);
    }

    /* 6) 일회성 지출 */
    const expRows = data.expenses
      .map((x) => {
        const e = entityId.get(x.entity);
        if (!e) return null;
        return {
          org_id: orgId,
          entity_id: e,
          item: x.item,
          planned_on: x.date,
          amount: x.amount,
          exec_state: x.execState,
        };
      })
      .filter(Boolean);
    if (expRows.length) {
      const { error } = await supabase.from('expenses').insert(expRows as object[]);
      if (error) throw error;
    }

    /* 7) 가정값 — 기간·기초잔액·안전선·신규매출 목표 */
    const { error: aErr } = await supabase.from('assumption_sets').insert({
      org_id: orgId,
      name: '샘플',
      start_date: data.defaults.startDate,
      weeks: data.defaults.weeks,
      opening_cash: data.defaults.openingCash,
      warn_line: data.defaults.warnLine,
      params: data.assumptions,
    });
    if (aErr) throw aErr;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `샘플 데이터를 넣지 못했습니다: ${message}` };
  }

  revalidatePath('/', 'layout');
  return {
    ok: true,
    message: `샘플 데이터를 넣었습니다 — 채권 ${data.receivables.length}건 · 고정비 ${data.fixedCosts.length}건 · 지출 ${data.expenses.length}건`,
  };
}

/** 샘플로 넣은 것을 전부 지운다 */
export async function clearOrgData(orgId: string): Promise<SeedResult> {
  const supabase = await createClient();
  try {
    for (const t of ['receivables', 'opportunities', 'expenses', 'fixed_costs', 'assumption_sets']) {
      const { error } = await supabase.from(t).delete().eq('org_id', orgId);
      if (error) throw error;
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: '이 회사의 자금 데이터를 비웠습니다 (법인·거래처는 남습니다)' };
}
