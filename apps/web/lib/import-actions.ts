'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DataKind } from '@/lib/parse/schema';
import type { Issue, ParsedRow } from '@/lib/parse/validate';

export interface ImportPayload {
  orgId: string;
  kind: DataKind;
  submissionKind: string;
  fileName: string;
  asOf: string;
  rows: ParsedRow[];
  issues: Issue[];
}

export interface ImportResult {
  ok: boolean;
  message: string;
  inserted?: number;
  skipped?: number;
}

/**
 * 올린 파일을 도메인 테이블에 반영한다.
 *
 * 원본 행은 submission_rows 에 그대로 남긴다 (docs/03 원칙 1 · 제출과 사실을 분리).
 * 파싱 규칙이 바뀌면 여기서 다시 돌릴 수 있어야 한다.
 * 오류가 있는 행은 넣지 않는다 — 나머지만 반영하고 몇 줄을 건너뛰었는지 알려 준다.
 */
export async function importSubmission(payload: ImportPayload): Promise<ImportResult> {
  const { orgId, kind, submissionKind, fileName, asOf, rows, issues } = payload;
  const supabase = await createClient();

  const valid = rows.filter((r) => r.valid);
  if (valid.length === 0) {
    return { ok: false, message: '넣을 수 있는 행이 없습니다. 오류를 고쳐 다시 올려 주세요' };
  }

  /* ── 회차 · 제출 기록 ─────────────────────────────────────── */
  const { data: period, error: pErr } = await supabase
    .from('report_periods')
    .upsert({ org_id: orgId, as_of: asOf }, { onConflict: 'org_id,as_of' })
    .select('id')
    .single();
  if (pErr) return { ok: false, message: `회차를 만들지 못했습니다: ${pErr.message}` };

  const { data: sub, error: sErr } = await supabase
    .from('submissions')
    .insert({
      org_id: orgId,
      period_id: period.id,
      kind: submissionKind,
      file_name: fileName,
      row_count: rows.length,
      error_count: issues.filter((i) => i.severity === 'error').length,
      status: 'validated',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (sErr) return { ok: false, message: `제출 기록을 남기지 못했습니다: ${sErr.message}` };

  // 원본은 통째로 남긴다
  await supabase.from('submission_rows').insert(
    rows.map((r) => ({
      submission_id: sub.id,
      row_no: r.rowNo,
      raw: r.raw,
      parsed: r.parsed,
      is_valid: r.valid,
    })),
  );
  if (issues.length) {
    await supabase.from('validation_issues').insert(
      issues.map((i) => ({
        submission_id: sub.id,
        row_no: i.rowNo || null,
        column_name: i.column,
        severity: i.severity,
        code: i.code,
        message: i.message,
      })),
    );
  }

  /* ── 마스터 확보 ─────────────────────────────────────────── */
  const entityId = await entityMap(supabase, orgId);
  const need = (name: string | null): string | null => (name ? (entityId.get(name) ?? null) : null);

  let inserted = 0;

  try {
    if (kind === '채권') {
      const cpId = await ensureCounterparties(
        supabase,
        orgId,
        valid.map((r) => String(r.parsed.counterparty ?? '')),
      );
      const payloadRows = valid
        .map((r) => {
          const p = r.parsed;
          const e = need(p.entity as string);
          const c = cpId.get(String(p.counterparty ?? ''));
          if (!e || !c) return null;
          return {
            org_id: orgId,
            entity_id: e,
            counterparty_id: c,
            kind: (p.kind as string) || '일반매출',
            issued_on: (p.issuedOn as string) || null,
            due_on: p.dueOn as string,
            amount_billed: p.amountBilled as number,
            amount_collected: (p.amountCollected as number) ?? 0,
            terms_days: (p.termsDays as number) ?? null,
            evidence_no: (p.evidenceNo as string) || null,
            source_submission_id: sub.id,
            source_row_no: r.rowNo,
          };
        })
        .filter(Boolean);
      const { error } = await supabase.from('receivables').insert(payloadRows as object[]);
      if (error) throw error;
      inserted = payloadRows.length;
    }

    if (kind === '영업파이프라인') {
      const payloadRows = valid
        .map((r) => {
          const p = r.parsed;
          const e = need(p.entity as string);
          if (!e) return null;
          return {
            org_id: orgId,
            entity_id: e,
            kind: '일반매출',
            title: p.title as string,
            // 거래처 이름이나 id 중 하나는 반드시 있어야 한다 (opp_needs_counterparty).
            // 파일에 거래처 열이 없으면 건명으로 채운다.
            counterparty_name: (p.counterparty as string) || (p.title as string),
            stage: p.stage as string,
            amount_expected: p.amountExpected as number,
            win_rate_override: (p.winRate as number) ?? null,
            expected_due_on: p.expectedDueOn as string,
            product_name: (p.category as string) || null,
            source_submission_id: sub.id,
          };
        })
        .filter(Boolean);
      const { error } = await supabase.from('opportunities').insert(payloadRows as object[]);
      if (error) throw error;
      inserted = payloadRows.length;
    }

    if (kind === '고정비') {
      // 같은 항목이 법인별로 여러 줄일 수 있다 — 항목 하나로 묶고 배분만 나눈다
      const byItem = new Map<string, { row: ParsedRow; shares: { entity: string; share: number }[] }>();
      for (const r of valid) {
        const item = String(r.parsed.item ?? '');
        const cur = byItem.get(item) ?? { row: r, shares: [] };
        const se = r.parsed.shareEntity as string | null;
        const sh = r.parsed.share as number | null;
        if (se && sh != null) cur.shares.push({ entity: se, share: sh });
        byItem.set(item, cur);
      }

      for (const [item, g] of byItem) {
        const p = g.row.parsed;
        const { data: fc, error } = await supabase
          .from('fixed_costs')
          .insert({
            org_id: orgId,
            item,
            account_code: (p.accountCode as string) || null,
            monthly_amount: p.monthlyAmount as number,
            pay_day: p.payDay as number,
            effective_from: asOf,
            source_submission_id: sub.id,
          })
          .select('id')
          .single();
        if (error) throw error;

        const shares = g.shares.length
          ? g.shares
          : [...entityId.keys()].map((e) => ({ entity: e, share: 1 / entityId.size }));
        const rows2 = shares
          .map((s) => {
            const eid = entityId.get(s.entity);
            return eid ? { fixed_cost_id: fc.id, entity_id: eid, share: s.share } : null;
          })
          .filter(Boolean);
        if (rows2.length) await supabase.from('fixed_cost_shares').insert(rows2 as object[]);
        inserted++;
      }
    }

    if (kind === '일회성지출') {
      const payloadRows = valid
        .map((r) => {
          const p = r.parsed;
          const e = need(p.entity as string);
          if (!e) return null;
          return {
            org_id: orgId,
            entity_id: e,
            item: p.item as string,
            category: (p.category as string) || null,
            planned_on: p.plannedOn as string,
            amount: p.amount as number,
            exec_state: (p.execState as string) || '집행',
            deferred_to: (p.deferredTo as string) || null,
            approval_state: (p.approvalState as string) || '미신청',
            source_submission_id: sub.id,
          };
        })
        .filter(Boolean);
      const { error } = await supabase.from('expenses').insert(payloadRows as object[]);
      if (error) throw error;
      inserted = payloadRows.length;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('submissions').update({ status: 'rejected', note: message }).eq('id', sub.id);
    return { ok: false, message: `반영 중 오류: ${message}` };
  }

  await supabase
    .from('submissions')
    .update({ status: 'applied', applied_at: new Date().toISOString() })
    .eq('id', sub.id);

  revalidatePath('/', 'layout');
  return {
    ok: true,
    message: `${inserted}건을 반영했습니다`,
    inserted,
    skipped: rows.length - valid.length,
  };
}

/* ── 마스터 헬퍼 ──────────────────────────────────────────────── */

type Db = Awaited<ReturnType<typeof createClient>>;

async function entityMap(supabase: Db, orgId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('entities').select('id, name').eq('org_id', orgId);
  const m = new Map<string, string>();
  for (const e of data ?? []) m.set(e.name as string, e.id as string);
  return m;
}

/** 없는 거래처는 만들어 준다 — 매번 손으로 등록하게 하지 않는다 */
async function ensureCounterparties(
  supabase: Db,
  orgId: string,
  names: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(names.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data: existing } = await supabase
    .from('counterparties')
    .select('id, name')
    .eq('org_id', orgId)
    .in('name', unique);
  for (const c of existing ?? []) map.set(c.name as string, c.id as string);

  const missing = unique.filter((n) => !map.has(n));
  if (missing.length) {
    const { data: created } = await supabase
      .from('counterparties')
      .insert(missing.map((name) => ({ org_id: orgId, name })))
      .select('id, name');
    for (const c of created ?? []) map.set(c.name as string, c.id as string);
  }
  return map;
}
