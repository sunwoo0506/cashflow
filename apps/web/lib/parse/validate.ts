/**
 * 올린 행을 검사해서 「어느 줄 어느 열이 왜 틀렸는지」를 만든다 (docs/02 §5.1).
 * 값을 추측해서 고쳐 넣지 않는다 — 틀린 건 틀렸다고 돌려준다.
 */
import { kindSpec, type DataKind, type FieldSpec, type KindSpec } from './schema';

export interface Issue {
  rowNo: number;
  column: string | null;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ParsedRow {
  rowNo: number;
  raw: Record<string, unknown>;
  parsed: Record<string, unknown>;
  valid: boolean;
}

export interface ParseResult {
  rows: ParsedRow[];
  issues: Issue[];
  /** 코드별 개수 — 화면 요약용 */
  summary: Record<string, number>;
}

/* ── 값 정규화 ────────────────────────────────────────────────── */

/** 1,234,000 · "1234000원" · 숫자 → 정수 원. 못 읽으면 null */
export function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v).replace(/[,\s원₩]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** 0.7 · 70 · "70%" → 0.7. 못 읽으면 null */
export function toPercent(v: unknown): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[\s%]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const r = n > 1 ? n / 100 : n;
  return r >= 0 && r <= 1 ? r : null;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** 엑셀 일련번호 · 2026-08-13 · 2026/8/13 · 20260813 → 'YYYY-MM-DD'. 못 읽으면 null */
export function toDate(v: unknown): string | null {
  if (v == null || v === '') return null;

  // 엑셀이 날짜를 숫자로 준 경우
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(EXCEL_EPOCH + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))
      .toISOString()
      .slice(0, 10);
  }

  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.년\s]+(\d{1,2})[-/.월\s]+(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const cell = (row: unknown[], idx: number | null): unknown =>
  idx == null ? null : (row[idx] ?? null);

const isBlank = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '');

/* ── 검사 ─────────────────────────────────────────────────────── */

export interface ValidateOptions {
  /** 회사 설정에 등록된 법인 이름들. 비어 있으면 법인 검사를 건너뛴다 */
  knownEntities: string[];
}

export function validateRows(
  kind: DataKind,
  headers: string[],
  rows: unknown[][],
  mapping: Record<string, number | null>,
  options: ValidateOptions,
): ParseResult {
  const spec: KindSpec = kindSpec(kind);
  const issues: Issue[] = [];
  const out: ParsedRow[] = [];
  const seenEvidence = new Map<string, number>();
  const shareByItem = new Map<string, number>();

  const add = (rowNo: number, column: string | null, code: string, message: string, severity: 'error' | 'warning' = 'error') =>
    issues.push({ rowNo, column, severity, code, message });

  rows.forEach((row, i) => {
    const rowNo = i + 2; // 1행은 헤더
    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      raw[h || `열${idx + 1}`] = row[idx] ?? null;
    });

    // 전부 빈 줄은 건너뛴다
    if (row.every(isBlank)) return;

    const parsed: Record<string, unknown> = {};
    let ok = true;

    for (const f of spec.fields as FieldSpec[]) {
      const idx = mapping[f.key] ?? null;
      const v = cell(row, idx);
      const label = f.label;

      if (isBlank(v)) {
        if (f.required) {
          ok = false;
          add(rowNo, label, missingCode(f.key), `${label} 이(가) 비어 있습니다`);
        }
        parsed[f.key] = null;
        continue;
      }

      switch (f.type) {
        case 'number': {
          const n = toNumber(v);
          if (n === null) {
            ok = false;
            add(rowNo, label, 'AMOUNT_NOT_NUMBER', `${label} 「${String(v)}」 을(를) 숫자로 읽을 수 없습니다`);
          } else if (n < 0 && f.key !== 'share') {
            ok = false;
            add(rowNo, label, 'AMOUNT_NEGATIVE', `${label} 이(가) 음수입니다 (${n})`);
          }
          parsed[f.key] = n;
          break;
        }
        case 'date': {
          const d = toDate(v);
          if (d === null) {
            ok = false;
            add(rowNo, label, 'BAD_DATE_FORMAT', `${label} 「${String(v)}」 을(를) 날짜로 읽을 수 없습니다`);
          }
          parsed[f.key] = d;
          break;
        }
        case 'percent': {
          const p = toPercent(v);
          if (p === null) {
            ok = false;
            add(rowNo, label, 'PERCENT_INVALID', `${label} 「${String(v)}」 은(는) 0~100% 범위가 아닙니다`);
          }
          parsed[f.key] = p;
          break;
        }
        case 'enum': {
          const s = String(v).trim();
          if (f.options && !f.options.includes(s)) {
            ok = false;
            add(
              rowNo,
              label,
              'ENUM_UNKNOWN',
              `${label} 「${s}」 은(는) 쓸 수 없는 값입니다. ${f.options.join(' / ')} 중에서 골라 주세요`,
            );
          }
          parsed[f.key] = s;
          break;
        }
        default:
          parsed[f.key] = String(v).trim();
      }
    }

    /* ── 종류별 추가 검사 ─────────────────────────────────────── */
    const entity = parsed.entity as string | null;
    if (entity && options.knownEntities.length > 0 && !options.knownEntities.includes(entity)) {
      ok = false;
      add(
        rowNo,
        '법인',
        'UNKNOWN_ENTITY',
        `「${entity}」 은(는) 회사 설정에 없는 법인입니다. 먼저 등록하거나 이름을 맞춰 주세요`,
      );
    }

    if (kind === '채권') {
      const billed = parsed.amountBilled as number | null;
      const collected = (parsed.amountCollected as number | null) ?? 0;
      if (billed != null && collected > billed) {
        ok = false;
        add(rowNo, '받은 금액', 'COLLECTED_GT_BILLED', `받은 금액(${collected})이 청구금액(${billed})보다 큽니다`);
      }
      const ev = parsed.evidenceNo as string | null;
      if (ev) {
        const prev = seenEvidence.get(ev);
        if (prev) {
          ok = false;
          add(rowNo, '증빙번호', 'DUP_EVIDENCE_NO', `증빙번호 「${ev}」 이(가) ${prev}행과 중복입니다`);
        } else seenEvidence.set(ev, rowNo);
      }
    }

    if (kind === '고정비') {
      const day = parsed.payDay as number | null;
      if (day != null && (day < 1 || day > 31)) {
        ok = false;
        add(rowNo, '지급일', 'PAY_DAY_RANGE', `지급일은 1~31 이어야 합니다 (${day})`);
      }
      const item = parsed.item as string | null;
      const share = parsed.share as number | null;
      if (item && share != null) {
        shareByItem.set(item, (shareByItem.get(item) ?? 0) + share);
      }
    }

    if (kind === '일회성지출') {
      if (parsed.execState === '연기' && !parsed.deferredTo) {
        ok = false;
        add(rowNo, '연기 예정일', 'DEFER_NEEDS_DATE', '집행상태가 「연기」면 연기 예정일이 필요합니다');
      }
    }

    out.push({ rowNo, raw, parsed, valid: ok });
  });

  // 고정비 배분 합 검사 — 항목 단위라 행을 다 본 뒤에 판정한다
  if (kind === '고정비') {
    for (const [item, sum] of shareByItem) {
      if (Math.abs(sum - 1) > 0.005) {
        add(
          0,
          '배분 비율',
          'SHARE_SUM_NOT_100',
          `「${item}」 의 배분 비율 합이 ${Math.round(sum * 100)}% 입니다 (100% 여야 합니다)`,
        );
        for (const r of out) if (r.parsed.item === item) r.valid = false;
      }
    }
  }

  const summary: Record<string, number> = {};
  for (const i of issues) summary[i.code] = (summary[i.code] ?? 0) + 1;

  return { rows: out, issues, summary };
}

function missingCode(key: string): string {
  if (key === 'dueOn' || key === 'expectedDueOn') return 'MISSING_DUE_ON';
  if (key === 'entity') return 'MISSING_ENTITY';
  return 'MISSING_REQUIRED';
}
