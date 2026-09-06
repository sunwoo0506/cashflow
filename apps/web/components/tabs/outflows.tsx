'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { fmt, mdate, pct } from '@/lib/format';
import { AssumedNote, Badge, Card, Empty, MoneyTile, TileGrid } from '@/components/ui';

export function OutflowsTab() {
  return (
    <>
      <OneOffs />
      <MonthlyByCategory />
      <FixedCosts />
    </>
  );
}

/* ── 4.1 고정비 외 지출건 ─────────────────────────────────────────── */
function OneOffs() {
  const s = useStore();
  const { result, entity } = s;

  /** 기간 안에 실제로 배치된 건 — 엔진이 계산한 위치를 그대로 읽는다 */
  const placed = useMemo(() => {
    const rows: {
      code: string;
      label: string;
      name: string;
      entity: string;
      date: string;
      amount: number;
      placement: string;
      to?: string;
      from?: string;
    }[] = [];
    for (const w of result.weeks) {
      for (const o of w.outflows) {
        if (o.kind !== '기타 지출') continue;
        rows.push({
          code: w.code,
          label: w.label,
          name: o.name,
          entity: o.entity,
          date: o.date,
          amount: o.amount,
          placement: o.placement,
          to: o.to,
          from: o.from,
        });
      }
    }
    return rows;
  }, [result]);

  // 이월로 들어온 행은 원래 자리에서 이미 '연기'로 한 번 보였으므로 표에서는 집행/연기/취소만 센다
  const primary = placed.filter((r) => r.placement !== '이월');
  const total = placed.filter((r) => r.placement === '집행' || r.placement === '이월')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <Card
      title="고정비 외 지출건"
      sub={`${entity ?? '두 법인 합산'} · 기간 안에 잡힌 ${primary.length}건`}
    >
      <TileGrid>
        <MoneyTile label="기간 총 집행액" value={total} />
        <MoneyTile
          label="연기"
          value={primary.filter((r) => r.placement === '연기').reduce((s2, r) => s2 + r.amount, 0)}
          tone="warn"
        />
        <MoneyTile
          label="취소"
          value={result.cancelled.reduce((s2, o) => s2 + o.amount, 0)}
        />
        <MoneyTile
          label="연내 미집행"
          value={result.deferredOutOfRange.reduce((s2, o) => s2 + o.amount, 0)}
          hint={`${result.deferredOutOfRange.length}건`}
        />
        <MoneyTile label="고정비 합계" value={result.weeks.reduce((s2, w) => s2 + w.fixedCost, 0)} />
        <MoneyTile label="총유출" value={result.totalOut} />
      </TileGrid>

      <div className="scroll-x mt-3">
        <table className="min-w-[620px]">
          <thead>
            <tr>
              <th>항목</th>
              <th>법인</th>
              <th>예정일</th>
              <th>주차</th>
              <th>집행상태</th>
              <th>허가상태</th>
              <th>금액</th>
            </tr>
          </thead>
          <tbody>
            {primary.map((r, i) => (
              <tr key={`${r.name}-${r.date}-${i}`}>
                <td>{r.name}</td>
                <td className="text-muted">{r.entity}</td>
                <td className="text-muted">{mdate(r.date)}</td>
                <td className="text-muted">{r.code}</td>
                <td>
                  {r.placement === '집행' && <Badge tone="good">집행</Badge>}
                  {r.placement === '연기' && (
                    <>
                      <Badge tone="warn">연기</Badge>
                      <span className="ml-1 text-[11px] text-muted">→ {r.to}</span>
                    </>
                  )}
                  {r.placement === '취소' && <Badge tone="muted">취소</Badge>}
                </td>
                <td className="text-muted">
                  {/* 허가상태는 제출 양식에서 받는 값이다. 픽스처에 없으므로 추측하지 않는다. */}
                  <span className="text-[11px]">미기재</span>
                </td>
                <td
                  className="font-[650]"
                  style={{ color: r.placement === '취소' ? 'var(--text-muted)' : undefined }}
                >
                  {fmt(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AssumedNote>
        집행상태·허가상태를 그 자리에서 바꾸는 편집과, 「연기」 선택 시 옮길 주차 고르기는{' '}
        <b className="text-secondary">4단계(쓰기)</b>에서 붙습니다. 지금은 엔진이 계산한 배치를 그대로
        보여줍니다. 허가 승인 전인데 「집행」으로 둔 건의 ⚠ 표시도 허가상태 값이 들어와야 판정할 수
        있습니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 4.2 월별 누계 · 성격은 제출 양식에서 받은 값을 쓴다 ──────────── */
function MonthlyByCategory() {
  const s = useStore();
  const hasCategory = s.data.expenses.some((e) => e.category);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of s.result.weeks) {
      for (const o of w.outflows) {
        if (o.kind !== '기타 지출') continue;
        if (o.placement !== '집행' && o.placement !== '이월') continue;
        map.set(w.month, (map.get(w.month) ?? 0) + o.amount);
      }
    }
    return [...map.entries()];
  }, [s.result]);

  const total = byMonth.reduce((sum, [, v]) => sum + v, 0);

  return (
    <Card title="고정비 외 지출건 월별 누계">
      {!hasCategory && (
        <Empty>
          성격(카테고리)별로 나누려면 제출 양식의 <b>성격</b> 열이 필요합니다.
          <br />
          지금 데이터에는 그 값이 없어 <b>항목 이름으로 추측하지 않고</b> 월별 합계만 보여줍니다.
        </Empty>
      )}
      <div className="scroll-x mt-3">
        <table className="min-w-[360px]">
          <thead>
            <tr>
              <th>월</th>
              <th>고정비 외 지출</th>
              <th>비중</th>
            </tr>
          </thead>
          <tbody>
            {byMonth.map(([m, v]) => (
              <tr key={m}>
                <td>{m}</td>
                <td>{fmt(v)}</td>
                <td className="text-muted">{total ? pct(v / total) : '-'}</td>
              </tr>
            ))}
            <tr>
              <td className="font-[650]">합계</td>
              <td className="font-[650]">{fmt(total)}</td>
              <td className="text-muted">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── 4.3 고정비 내역 ──────────────────────────────────────────────── */
function FixedCosts() {
  const s = useStore();
  const { fixedCosts } = s.data;
  const monthly = fixedCosts.reduce((sum, f) => sum + f.amount, 0);

  return (
    <Card title="고정비 내역" sub="매달 지급일에 나갑니다">
      <div className="scroll-x">
        <table className="min-w-[560px]">
          <thead>
            <tr>
              <th>항목</th>
              <th>계정과목</th>
              <th>지급일</th>
              <th>월액</th>
              <th>법인A</th>
              <th>법인B</th>
              <th>배분 합</th>
            </tr>
          </thead>
          <tbody>
            {fixedCosts.map((f) => {
              const z = f.shares['법인A'] ?? 0;
              const n = f.shares['법인B'] ?? 0;
              const sum = z + n;
              const ok = Math.abs(sum - 1) < 1e-9;
              return (
                <tr key={f.id}>
                  <td>{f.item}</td>
                  {/* 계정과목도 제출 양식에서 받는 값이다. 항목 이름으로 추측하지 않는다. */}
                  <td className="text-muted">
                    <span className="text-[11px]">미기재</span>
                  </td>
                  <td className="text-muted">매월 {f.payDay}일</td>
                  <td className="font-[650]">{fmt(f.amount)}</td>
                  <td className="text-muted">{pct(z)}</td>
                  <td className="text-muted">{pct(n)}</td>
                  <td>
                    {ok ? (
                      <Badge tone="good">100%</Badge>
                    ) : (
                      <Badge tone="crit">{pct(sum)}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="font-[650]">월 합계</td>
              <td colSpan={2} />
              <td className="font-[650]">{fmt(monthly)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
      <AssumedNote>
        지급일이 그 달 말일보다 크면 말일에 나가는 것으로 봅니다. 법인을 고르면 배분 비율을 곱한
        금액만 잡힙니다. 배분 합이 100%가 아니면 저장을 막는 검증은 4단계(쓰기)에서 붙습니다.
      </AssumedNote>
    </Card>
  );
}
