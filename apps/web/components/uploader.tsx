'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { KINDS, autoMap, kindSpec, type DataKind } from '@/lib/parse/schema';
import { validateRows, type Issue, type ParseResult } from '@/lib/parse/validate';
import { importSubmission } from '@/lib/import-actions';
import { fmt } from '@/lib/format';

const input =
  'w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-[color:var(--brand-accent)]';
const primary =
  'rounded-lg bg-brand-accent px-3 py-2 text-[13.5px] font-[650] text-white disabled:opacity-60';
const ghost = 'rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-[550]';

interface Sheet {
  name: string;
  headers: string[];
  rows: unknown[][];
}

export function Uploader({
  orgId,
  entities,
  asOf,
}: {
  orgId: string;
  entities: string[];
  asOf: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [kind, setKind] = useState<DataKind>('채권');
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [headerRow, setHeaderRow] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sheet = sheets[sheetIdx];
  const spec = kindSpec(kind);

  /* ── 파일 읽기 ─────────────────────────────────────────────── */
  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const parsed: Sheet[] = wb.SheetNames.map((name) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, {
          header: 1,
          blankrows: false,
          defval: null,
        });
        return { name, headers: [], rows: grid };
      });
      setSheets(parsed);
      setSheetIdx(0);
      setHeaderRow(0);
      if (parsed[0]) applyHeader(parsed[0], 0, kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다');
    }
  }

  function applyHeader(s: Sheet, hr: number, k: DataKind) {
    const headers = (s.rows[hr] ?? []).map((h) => String(h ?? '').trim());
    setMapping(autoMap(headers, kindSpec(k)));
  }

  const headers = useMemo(
    () => (sheet ? (sheet.rows[headerRow] ?? []).map((h) => String(h ?? '').trim()) : []),
    [sheet, headerRow],
  );
  const dataRows = useMemo(
    () => (sheet ? sheet.rows.slice(headerRow + 1) : []),
    [sheet, headerRow],
  );

  /* ── 검사 ──────────────────────────────────────────────────── */
  const check: ParseResult | null = useMemo(() => {
    if (!sheet || headers.length === 0) return null;
    return validateRows(kind, headers, dataRows, mapping, { knownEntities: entities });
  }, [sheet, headers, dataRows, kind, mapping, entities]);

  const errorCount = check?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const validCount = check?.rows.filter((r) => r.valid).length ?? 0;

  function doImport() {
    if (!check) return;
    start(async () => {
      const r = await importSubmission({
        orgId,
        kind,
        submissionKind: spec.submissionKind,
        fileName: fileName ?? '(이름 없음)',
        asOf,
        rows: check.rows,
        issues: check.issues,
      });
      setResult(r);
    });
  }

  /* ── 화면 ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-3">
      {/* 1) 파일 */}
      <section className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
        <h2 className="text-[14px] font-[650]">1 · 파일 고르기</h2>
        <p className="mt-0.5 mb-3 text-[12px] text-muted">
          엑셀(.xlsx, .xls) 또는 CSV. 여러 시트가 있으면 아래에서 고릅니다.
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-line bg-surface-2 px-4 py-8 text-center hover:border-[color:var(--brand-line)]"
        >
          <p className="text-[13.5px] font-[650]">
            {fileName ?? '여기로 파일을 끌어다 놓거나 눌러서 고르세요'}
          </p>
          {fileName && <p className="mt-1 text-[12px] text-muted">다른 파일로 바꾸려면 다시 누르세요</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {error && <p className="mt-2 text-[12.5px] text-crit">{error}</p>}
      </section>

      {sheets.length > 0 && (
        <>
          {/* 2) 시트 · 종류 · 헤더 줄 */}
          <section className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
            <h2 className="text-[14px] font-[650]">2 · 무엇을 올리는지</h2>
            <p className="mt-0.5 mb-3 text-[12px] text-muted">
              종류에 따라 들어가는 곳이 다릅니다.
            </p>

            <div className="flex flex-wrap gap-3">
              <label className="text-[12.5px]">
                <span className="block font-[650]">시트</span>
                <select
                  value={sheetIdx}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSheetIdx(i);
                    setHeaderRow(0);
                    if (sheets[i]) applyHeader(sheets[i], 0, kind);
                  }}
                  className={`${input} mt-1 w-[160px]`}
                >
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({Math.max(0, s.rows.length - 1)}행)
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[12.5px]">
                <span className="block font-[650]">종류</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as DataKind;
                    setKind(k);
                    if (sheet) applyHeader(sheet, headerRow, k);
                  }}
                  className={`${input} mt-1 w-[200px]`}
                >
                  {KINDS.map((s) => (
                    <option key={s.kind} value={s.kind}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[12.5px]">
                <span className="block font-[650]">머리글 줄</span>
                <select
                  value={headerRow}
                  onChange={(e) => {
                    const hr = Number(e.target.value);
                    setHeaderRow(hr);
                    if (sheet) applyHeader(sheet, hr, kind);
                  }}
                  className={`${input} mt-1 w-[120px]`}
                >
                  {(sheet?.rows ?? []).slice(0, 10).map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}번째 줄
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* 3) 열 맞추기 */}
          <section className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
            <h2 className="text-[14px] font-[650]">3 · 열 맞추기</h2>
            <p className="mt-0.5 mb-3 text-[12px] leading-relaxed text-muted">
              머리글을 보고 자동으로 맞췄습니다.{' '}
              <b className="text-secondary">틀린 게 있으면 여기서 고쳐 주세요</b> — 틀린 채로 넣으면
              숫자가 조용히 어긋납니다.
            </p>

            <div className="grid gap-2 min-[720px]:grid-cols-2">
              {spec.fields.map((f) => {
                const picked = mapping[f.key] ?? null;
                const missingRequired = f.required && picked === null;
                return (
                  <label key={f.key} className="text-[12.5px]">
                    <span className="flex items-baseline gap-1">
                      <b className="font-[650]">{f.label}</b>
                      {f.required && <span className="text-crit">*</span>}
                      {f.hint && <span className="text-[11px] text-muted">{f.hint}</span>}
                    </span>
                    <select
                      value={picked === null ? '' : picked}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          [f.key]: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className={`${input} mt-1 ${missingRequired ? 'border-[color:var(--crit)]' : ''}`}
                    >
                      <option value="">— 없음 —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `(빈 머리글 ${i + 1})`}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </section>

          {/* 4) 검사 결과 */}
          {check && (
            <section className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
              <h2 className="text-[14px] font-[650]">4 · 검사 결과</h2>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Stat label="전체" value={check.rows.length} />
                <Stat label="넣을 수 있는 행" value={validCount} tone={validCount ? 'good' : undefined} />
                <Stat label="오류" value={errorCount} tone={errorCount ? 'crit' : 'good'} />
              </div>

              {errorCount > 0 && <IssueTable issues={check.issues} />}

              {check.rows.length > 0 && (
                <details className="mt-3 rounded-xl border border-line bg-surface-2">
                  <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-[650]">
                    읽어들인 값 미리보기 (앞 5줄)
                  </summary>
                  <div className="scroll-x border-t border-line">
                    <table className="min-w-[520px]">
                      <thead>
                        <tr>
                          {spec.fields.map((f) => (
                            <th key={f.key}>{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {check.rows.slice(0, 5).map((r) => (
                          <tr key={r.rowNo}>
                            {spec.fields.map((f) => {
                              const v = r.parsed[f.key];
                              return (
                                <td key={f.key} className={v == null ? 'text-muted' : ''}>
                                  {v == null
                                    ? '-'
                                    : f.type === 'number'
                                      ? fmt(v as number)
                                      : f.type === 'percent'
                                        ? `${Math.round((v as number) * 100)}%`
                                        : String(v)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>
          )}

          {/* 5) 반영 */}
          <section className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
            <h2 className="text-[14px] font-[650]">5 · 반영</h2>
            <p className="mt-0.5 mb-3 text-[12px] leading-relaxed text-muted">
              오류가 있는 행은 넣지 않습니다. 원본은 그대로 보관되므로 규칙이 바뀌면 다시 돌릴 수
              있습니다.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={doImport} disabled={pending || validCount === 0} className={primary}>
                {pending ? '넣는 중…' : `${validCount}건 반영하기`}
              </button>
              {errorCount > 0 && (
                <span className="text-[12.5px] text-warn">
                  오류 {errorCount}건은 건너뜁니다
                </span>
              )}
            </div>
            {result && (
              <p className={`mt-2 text-[13px] ${result.ok ? 'text-good' : 'text-crit'}`}>
                {result.message}
                {result.ok && (
                  <>
                    {' · '}
                    <a href="/" className="underline">
                      자금 현황에서 확인하기
                    </a>
                  </>
                )}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'crit' }) {
  const color = tone === 'good' ? 'var(--good)' : tone === 'crit' ? 'var(--crit)' : undefined;
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="num text-[17px] font-[750]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function IssueTable({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error').slice(0, 60);
  return (
    <div className="scroll-x mt-3 rounded-xl border border-line">
      <table className="min-w-[520px]">
        <thead>
          <tr>
            <th>줄</th>
            <th>열</th>
            <th>무엇이 잘못됐나</th>
            <th>코드</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((i, k) => (
            <tr key={k}>
              <td className="num">{i.rowNo || '-'}</td>
              <td className="text-muted">{i.column ?? '-'}</td>
              <td className="text-left">{i.message}</td>
              <td className="text-[11px] text-muted">{i.code}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {issues.filter((i) => i.severity === 'error').length > 60 && (
        <p className="px-3 py-2 text-[12px] text-muted">
          … 외 {issues.filter((i) => i.severity === 'error').length - 60}건
        </p>
      )}
    </div>
  );
}
