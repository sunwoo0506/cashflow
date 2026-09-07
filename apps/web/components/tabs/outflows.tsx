'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { fmt, mdate, pct } from '@/lib/format';
import { AssumedNote, Badge, Card, MoneyTile, TileGrid } from '@/components/ui';

export function OutflowsTab() {
  return (
    <>
      <OneOffs />
      <MonthlyByCategory />
      <FixedCosts />
    </>
  );
}

/**
 * 항목 이름으로 성격을 추정한다.
 *
 * 원칙은 「제출 양식에서 받은 값을 쓴다」이다. 다만 성격이 비어 있으면 화면이 통째로
 * 비어 버리므로, 이름으로 짚이는 것만 채우고 **「추정」이라고 표시**한다.
 * 양식에 값이 들어오면 그 값이 이긴다.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  [/매입|자재|원부자재|상품|구매|종자|묘목/, '매입'],
  [/급여|상여|성과급|수당|인건|퇴직|연차/, '인건비'],
  [/임차|보증금|시설|보수|공사/, '시설'],
  [/이자|차입|리스|금융|수수료/, '금융'],
  [/세금|부가세|법인세|원천|지방소득|납부/, '세금'],
  [/보험/, '보험'],
  [/운반|물류|포장|배송/, '물류'],
  [/전산|소프트|유지보수|시스템/, '전산'],
  [/외주|시공|용역/, '외주'],
  [/소모품|공구|비품/, '소모품'],
  [/법률|자문|법원|송달|인지|조사위원|변제/, '법무'],
  [/교육|훈련/, '교육'],
  [/전기|수도|가스|통신|광열/, '수도광열'],
  [/차량|유류/, '차량'],
];

export function guessCategory(item: string): string | null {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(item)) return cat;
  return null;
}

/* ── 4.1 고정비 외 지출건 ─────────────────────────────────────────── */
function OneOffs() {
  const s = useStore();
  const { result, entity } = s;

  /** 보고 있는 칸(주 또는 월)에 잡힌 건만 본다. 기간 전체를 한꺼번에 쏟지 않는다. */
  const scope = s.current;
  const unit = s.gran === 'week' ? '주' : '달';

  const rows = useMemo(() => {
    const out = (scope?.outflows ?? [])
      .filter((o) => o.kind === '기타 지출')
      .map((o) => ({
        name: o.name,
        entity: o.entity,
        date: o.date,
        amount: o.amount,
        placement: o.placement,
        to: o.to,
        expenseId: o.expenseId,
      }));
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [scope]);

  const executed = rows
    .filter((r) => r.placement === '집행' || r.placement === '이월')
    .reduce((sum, r) => sum + r.amount, 0);

  const categoryOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of s.data.expenses) if (e.category) m.set(e.id, e.category);
    return m;
  }, [s.data.expenses]);

  return (
    <Card
      title="고정비 외 지출건"
      sub={`${scope ? `${scope.code} · ${scope.label}` : ''} · ${entity ?? '전체 법인'} · 이 ${unit}에 잡힌 ${rows.length}건`}
    >
      <TileGrid>
        <MoneyTile label={`이 ${unit} 집행액`} value={executed} />
        <MoneyTile label={`이 ${unit} 고정비`} value={scope?.fixedCost ?? 0} />
        <MoneyTile label={`이 ${unit} 총지출`} value={scope?.outflow ?? 0} />
        <MoneyTile
          label="기간 전체 고정비 외"
          value={result.weeks.reduce((a, w) => a + w.expense, 0)}
        />
        <MoneyTile
          label="기간 전체 고정비"
          value={result.weeks.reduce((a, w) => a + w.fixedCost, 0)}
        />
        <MoneyTile label="기간 전체 총유출" value={result.totalOut} />
      </TileGrid>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-5 text-center text-[12.5px] text-muted">
          이 {unit}에는 고정비 외 지출이 없습니다. 위에서 다른 {unit}을 골라 보세요.
        </p>
      ) : (
        <div className="scroll-x mt-3">
          <table className="min-w-[620px]">
            <thead>
              <tr>
                <th>항목</th>
                <th>성격</th>
                <th>법인</th>
                <th>예정일</th>
                <th>집행상태</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const given = r.expenseId ? categoryOf.get(r.expenseId) : undefined;
                const guessed = given ? null : guessCategory(r.name);
                return (
                  <tr key={`${r.name}-${r.date}-${i}`}>
                    <td>{r.name}</td>
                    <td className="text-muted">
                      {given ?? guessed ?? '미기재'}
                      {!given && guessed && (
                        <span className="ml-1">
                          <Badge tone="warn">추정</Badge>
                        </span>
                      )}
                    </td>
                    <td className="text-muted">{r.entity}</td>
                    <td className="text-muted">{mdate(r.date)}</td>
                    <td>
                      {r.placement === '집행' && <Badge tone="good">집행</Badge>}
                      {r.placement === '이월' && <Badge tone="brand">이월</Badge>}
                      {r.placement === '연기' && (
                        <>
                          <Badge tone="warn">연기</Badge>
                          <span className="ml-1 text-[11px] text-muted">→ {r.to}</span>
                        </>
                      )}
                      {r.placement === '취소' && <Badge tone="muted">취소</Badge>}
                    </td>
                    <td
                      className="font-[650]"
                      style={{ color: r.placement === '취소' ? 'var(--text-muted)' : undefined }}
                    >
                      {fmt(r.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AssumedNote>
        위에서 고른 {unit}에 잡힌 건만 보여줍니다. 「연기」는 원래 자리에서 빠져 옮겨 간 곳에
        「이월」로 다시 잡힙니다. 집행상태를 그 자리에서 바꾸는 편집은 아직 없습니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 4.2 월별 누계 · 성격별 ───────────────────────────────────────── */
function MonthlyByCategory() {
  const s = useStore();

  const categoryOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of s.data.expenses) if (e.category) m.set(e.id, e.category);
    return m;
  }, [s.data.expenses]);

  const { months, rows, colTotal, grand, guessedTotal } = useMemo(() => {
    const monthSet: string[] = [];
    const table = new Map<string, Map<string, number>>();
    let guessed = 0;

    for (const w of s.result.weeks) {
      if (!monthSet.includes(w.month)) monthSet.push(w.month);
      for (const o of w.outflows) {
        if (o.kind !== '기타 지출') continue;
        if (o.placement !== '집행' && o.placement !== '이월') continue;
        const given = o.expenseId ? categoryOf.get(o.expenseId) : undefined;
        const cat = given ?? guessCategory(o.name) ?? '미기재';
        if (!given && cat !== '미기재') guessed += o.amount;
        const row = table.get(cat) ?? new Map<string, number>();
        row.set(w.month, (row.get(w.month) ?? 0) + o.amount);
        table.set(cat, row);
      }
    }

    const rows = [...table.entries()]
      .map(([cat, byMonth]) => ({
        cat,
        byMonth,
        total: [...byMonth.values()].reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total);

    const colTotal = new Map<string, number>();
    for (const r of rows) for (const [m, v] of r.byMonth) colTotal.set(m, (colTotal.get(m) ?? 0) + v);

    return {
      months: monthSet,
      rows,
      colTotal,
      grand: rows.reduce((a, r) => a + r.total, 0),
      guessedTotal: guessed,
    };
  }, [s.result, categoryOf]);

  return (
    <Card title="고정비 외 지출건 월별 누계" sub="성격별로 무엇이 언제 나가는지 · 기간 전체">
      <div className="scroll-x">
        <table className="min-w-[560px]">
          <thead>
            <tr>
              <th>성격</th>
              {months.map((m) => (
                <th key={m}>{m}</th>
              ))}
              <th>합계</th>
              <th>비중</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cat}>
                <td className={r.cat === '미기재' ? 'text-muted' : 'font-[650]'}>{r.cat}</td>
                {months.map((m) => (
                  <td key={m} className={r.byMonth.get(m) ? '' : 'text-muted'}>
                    {r.byMonth.get(m) ? fmt(r.byMonth.get(m)!) : '-'}
                  </td>
                ))}
                <td className="font-[650]">{fmt(r.total)}</td>
                <td className="text-muted">{grand ? pct(r.total / grand) : '-'}</td>
              </tr>
            ))}
            <tr>
              <td className="font-[650]">합계</td>
              {months.map((m) => (
                <td key={m} className="font-[650]">
                  {fmt(colTotal.get(m) ?? 0)}
                </td>
              ))}
              <td className="font-[650]">{fmt(grand)}</td>
              <td className="text-muted">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AssumedNote>
        집행·이월된 건만 셉니다 (취소·연내 미집행 제외).
        {guessedTotal > 0 && (
          <>
            {' '}
            제출 양식에 성격이 없는 <b className="num text-secondary">{fmt(guessedTotal)}</b>원은{' '}
            <b className="text-secondary">항목 이름으로 추정</b>했습니다 (
            <Badge tone="warn">추정</Badge>). 양식에 성격이 들어오면 그 값이 우선합니다.
          </>
        )}
      </AssumedNote>
    </Card>
  );
}

/* ── 4.3 고정비 내역 · 법인별로 따로 ──────────────────────────────── */
function FixedCosts() {
  const s = useStore();
  const { fixedCosts, entities } = s.data;

  // 법인을 고른 상태면 그 법인만, 아니면 등록된 법인을 각각 따로 보여준다
  const shown = s.entity ? [s.entity] : entities;

  /** 지금 보고 있는 달 — 그 달의 집행 상태를 보여준다 */
  const month = s.current?.month ?? s.result.months[0]?.month ?? '';

  /** 이 달 이 항목이 실제로 어떻게 처리됐는지 (엔진이 배치한 결과에서 읽는다) */
  const placedThisMonth = useMemo(() => {
    const m = new Map<string, { placement: string; to?: string; from?: string }>();
    for (const w of s.result.weeks) {
      for (const o of w.outflows) {
        if (o.kind !== '고정비' || !o.expenseId) continue;
        const inMonth = w.month === month;
        // 원래 자리(집행·연기·취소)를 그 달 기록으로 삼고, 이월은 옮겨 온 표시로만 쓴다
        if (inMonth && o.placement !== '이월') {
          m.set(o.expenseId, { placement: o.placement, to: o.to });
        } else if (inMonth && o.placement === '이월' && !m.has(o.expenseId)) {
          m.set(o.expenseId, { placement: '이월', from: o.from });
        }
      }
    }
    return m;
  }, [s.result, month]);

  return (
    <>
      {shown.map((e) => {
        const rows = fixedCosts
          .map((f) => ({ f, share: f.shares[e] ?? 0 }))
          .filter((r) => r.share > 0)
          .map((r) => ({ ...r, amount: Math.round(r.f.amount * r.share) }));
        const monthly = rows.reduce((a, r) => a + r.amount, 0);

        return (
          <Card
            key={e}
            title={`고정비 내역 · ${e}`}
            sub={`이 법인이 매달 부담하는 금액 · 월 ${fmt(monthly)}원`}
          >
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-5 text-center text-[12.5px] text-muted">
                이 법인에 배분된 고정비가 없습니다.
              </p>
            ) : (
              <div className="scroll-x">
                <table className="min-w-[520px]">
                  <thead>
                    <tr>
                      <th>항목</th>
                      <th>성격</th>
                      <th>지급일</th>
                      <th>{month} 집행</th>
                      <th>이 법인 부담</th>
                      <th>부담률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ f, share, amount }) => {
                      const st = placedThisMonth.get(f.id);
                      const cancelled = st?.placement === '취소';
                      return (
                        <tr key={f.id}>
                          <td>{f.item}</td>
                          <td className="text-muted">
                            {guessCategory(f.item) ?? '미기재'}
                            {guessCategory(f.item) && (
                              <span className="ml-1">
                                <Badge tone="warn">추정</Badge>
                              </span>
                            )}
                          </td>
                          <td className="text-muted">매월 {f.payDay}일</td>
                          <td>
                            {!st && <span className="text-[11px] text-muted">기간 밖</span>}
                            {st?.placement === '집행' && <Badge tone="good">집행</Badge>}
                            {st?.placement === '이월' && (
                              <>
                                <Badge tone="brand">이월</Badge>
                                <span className="ml-1 text-[11px] text-muted">{st.from}에서</span>
                              </>
                            )}
                            {st?.placement === '연기' && (
                              <>
                                <Badge tone="warn">연기</Badge>
                                <span className="ml-1 text-[11px] text-muted">→ {st.to}</span>
                              </>
                            )}
                            {cancelled && <Badge tone="muted">취소</Badge>}
                          </td>
                          <td
                            className="font-[650]"
                            style={{ color: cancelled ? 'var(--text-muted)' : undefined }}
                          >
                            {fmt(amount)}
                          </td>
                          <td className="text-muted">{pct(share)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="font-[650]">월 합계</td>
                      <td colSpan={3} />
                      <td className="font-[650]">{fmt(monthly)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      <AssumedNote>
        고정비는 <b className="text-secondary">법인마다 따로</b> 계산됩니다. 위 표의 금액이 그 법인이
        실제로 부담하는 돈이고, 상단에서 법인을 고르면 그 금액만 잡힙니다. 지급일이 그 달 말일보다
        크면 말일에 나가는 것으로 봅니다.
        <br />
        <b className="text-secondary">{month} 집행</b> 칸은 그 달에 실제로 어떻게 처리됐는지입니다 —
        따로 적어 둔 기록이 없으면 「집행」입니다. 미루거나 건너뛴 달은 그 달 기록에 남고,
        옮겨 간 곳에는 「이월」로 다시 잡힙니다. 상단에서 달을 바꾸면 그 달 기준으로 바뀝니다.
      </AssumedNote>
    </>
  );
}
