'use client';

import { AGING_BUCKETS, winRateOf, type AgingBucket } from 'cashflow-engine';
import { useStore } from '@/lib/store';
import { fmt, mdate, pct, won } from '@/lib/format';
import {
  AssumedNote,
  Badge,
  Card,
  Empty,
  Legend,
  MoneyTile,
  StackBar,
  TileGrid,
} from '@/components/ui';

const AGE_COLOR: Record<AgingBucket, string> = {
  정상: 'var(--age1)',
  '30일': 'var(--age2)',
  '60일': 'var(--age3)',
  '90일': 'var(--age4)',
  '90일초과': 'var(--age5)',
  '회수예정일 미정': 'var(--age6)',
};

const AGE_LABEL: Record<AgingBucket, string> = {
  정상: '정상',
  '30일': '30일 경과',
  '60일': '60일 경과',
  '90일': '90일 경과',
  '90일초과': '90일 초과',
  '회수예정일 미정': '회수예정일 미정',
};

export function ReceivablesTab() {
  return (
    <>
      <ArTiles />
      <Aging />
      <ByEntityKind />
      <TopUnpaid />
      <SupportProgress />
      <WonUnbilled />
      <Pipeline />
      <WeeklyPlan />
    </>
  );
}

/* ── 3.1 매출채권 현황 ────────────────────────────────────────────── */
function ArTiles() {
  const { aging, data, entity } = useStore();
  const b = aging.buckets;

  const kindTotal = (kind: string) =>
    data.byEntityKind
      .filter((r) => r.kind === kind && (entity == null || r.entity === entity))
      .reduce((s, r) => s + r.amount, 0);

  const neg = data.negativeBalances.filter((n) => entity == null || n.entity === entity);

  return (
    <Card title="매출채권 현황" sub={`기준 ${data.asOf} · ${entity ?? '두 법인 합산'}`}>
      <TileGrid>
        <MoneyTile label="매출채권 총액" value={aging.total} />
        <MoneyTile label="일반매출 채권" value={kindTotal('일반매출')} />
        <MoneyTile label="지원사업 채권" value={kindTotal('지원사업')} />
        <MoneyTile
          label="60일 이상 경과"
          value={b['60일'] + b['90일'] + b['90일초과']}
          tone="warn"
        />
        <MoneyTile label="90일 초과" value={b['90일초과']} tone="crit" />
        <MoneyTile
          label="마이너스 잔액"
          value={neg.reduce((s, n) => s + n.balance, 0)}
          hint={`${neg.length}건`}
        />
      </TileGrid>
      <AssumedNote>
        법인·구분별 채권은 원장 집계값이라 법인 필터만 반영됩니다. 마이너스 잔액은 선수금이나
        반품으로 잔액이 음수가 된 건입니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 3.2 채권 연령 분석 ★ 잔액을 나눈다. 매출액이 아니다 ─────────── */
function Aging() {
  const { aging, data, entity } = useStore();
  const sum = AGING_BUCKETS.reduce((s, b) => s + aging.buckets[b], 0);
  // 전체 통합일 때만 원장 총액과 대조할 수 있다 (미정 역산분은 법인이 없다)
  const canCompare = entity == null;
  const matches = sum === data.receivableTotal;

  return (
    <Card
      title="채권 연령 분석"
      sub="회수예정일이 지난 정도로 잔액을 나눕니다"
      right={
        canCompare ? (
          <Badge tone={matches ? 'good' : 'crit'}>{matches ? '합계 일치' : '합계 불일치'}</Badge>
        ) : null
      }
    >
      <StackBar
        parts={AGING_BUCKETS.map((b) => ({
          label: AGE_LABEL[b],
          value: aging.buckets[b],
          color: AGE_COLOR[b],
        }))}
      />
      <Legend
        items={AGING_BUCKETS.map((b) => ({
          label: AGE_LABEL[b],
          color: AGE_COLOR[b],
          value: aging.buckets[b],
        }))}
      />

      <div className="scroll-x mt-3">
        <table className="min-w-[420px]">
          <thead>
            <tr>
              <th>버킷</th>
              <th>잔액</th>
              <th>비중</th>
            </tr>
          </thead>
          <tbody>
            {AGING_BUCKETS.map((b) => (
              <tr key={b}>
                <td>
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle"
                    style={{ background: AGE_COLOR[b] }}
                  />
                  {AGE_LABEL[b]}
                </td>
                <td>{fmt(aging.buckets[b])}</td>
                <td className="text-muted">{sum ? pct(aging.buckets[b] / sum) : '-'}</td>
              </tr>
            ))}
            <tr>
              <td className="font-[650]">합계</td>
              <td className="font-[650]">{fmt(sum)}</td>
              <td className="text-muted">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AssumedNote>
        {canCompare ? (
          matches ? (
            <>
              6개 버킷 합계 <b className="num text-secondary">{fmt(sum)}</b>원이 매출채권 총액과{' '}
              <b className="text-secondary">정확히 일치합니다</b>.
            </>
          ) : (
            <b className="text-crit">
              6개 버킷 합계({fmt(sum)})가 매출채권 총액({fmt(data.receivableTotal)})과 다릅니다.
            </b>
          )
        ) : (
          <>법인을 고르면 「회수예정일 미정」 역산분은 어느 법인에도 속하지 않아 총액 대조를 하지 않습니다.</>
        )}{' '}
        「회수예정일 미정」은 아직 날짜가 안 잡힌 몫이라 경과일을 따질 수 없어 별도 칸에 회색으로
        둡니다. 청구 전(<Badge>청구전</Badge>) 건은 연령분석에서 제외합니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 3.3 법인 · 구분별 채권 ───────────────────────────────────────── */
function ByEntityKind() {
  const { data, entity } = useStore();
  const rows = data.byEntityKind.filter((r) => entity == null || r.entity === entity);
  const entities = [...new Set(rows.map((r) => r.entity))];

  return (
    <Card title="법인 · 구분별 채권">
      <div className="flex flex-col gap-3">
        {entities.map((e) => {
          const gen = rows.find((r) => r.entity === e && r.kind === '일반매출')?.amount ?? 0;
          const sup = rows.find((r) => r.entity === e && r.kind === '지원사업')?.amount ?? 0;
          return (
            <div key={e}>
              <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                <span className="font-[650]">{e}</span>
                <span className="num text-muted">{fmt(gen + sup)}</span>
              </div>
              <StackBar
                height={26}
                parts={[
                  { label: '일반매출', value: gen, color: 'var(--c1)' },
                  { label: '지원사업', value: sup, color: 'var(--c2)' },
                ]}
              />
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { label: '일반매출', color: 'var(--c1)' },
          { label: '지원사업', color: 'var(--c2)' },
        ]}
      />
    </Card>
  );
}

/* ── 3.4 미회수 상위 거래처 ───────────────────────────────────────── */
function TopUnpaid() {
  const { data, entity } = useStore();
  const rows = data.topCounterparties.filter((r) => entity == null || r.entity === entity);
  const external = rows.filter((r) => !r.isInternal);
  const top3 = external.slice(0, 3).reduce((s, r) => s + r.balance, 0);
  const internal = rows.filter((r) => r.isInternal);

  return (
    <Card title="미회수 상위 거래처" sub="잔액 순">
      <div className="scroll-x">
        <table className="min-w-[440px]">
          <thead>
            <tr>
              <th>거래처</th>
              <th>법인</th>
              <th>잔액</th>
            </tr>
          </thead>
          <tbody>
            {/* 같은 법인·거래처가 두 줄로 오기도 한다 (영업2팀_일반). 순번을 키에 넣는다. */}
            {rows.map((r, i) => (
              <tr key={`${r.entity}-${r.counterparty}-${i}`} className={r.isInternal ? 'text-muted' : ''}>
                <td>
                  {r.counterparty}
                  {r.isInternal && (
                    <span className="ml-1.5">
                      <Badge tone="muted">그룹 내부</Badge>
                    </span>
                  )}
                </td>
                <td className="text-muted">{r.entity}</td>
                <td className={r.isInternal ? '' : 'font-[650]'}>{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AssumedNote>
        외부 상위 3곳 합계 <b className="num text-secondary">{fmt(top3)}</b>원 ({won(top3)}).
        {internal.length > 0 && (
          <>
            {' '}
            그룹 내부 채권 <b className="num text-secondary">
              {fmt(internal.reduce((s, r) => s + r.balance, 0))}
            </b>
            원은 연결 기준으로 상계되므로 「받을 돈」으로 세지 않습니다.
          </>
        )}
      </AssumedNote>
    </Card>
  );
}

/* ── 3.5 지원사업 정산 진행 ───────────────────────────────────────── */
function SupportProgress() {
  const { data } = useStore();
  const { support, assumptions } = data;
  const u = assumptions.undatedReceivables;
  const remaining = u ? u.receivableTotal - u.plannedDeduction : 0;
  const expected = u ? Math.round(remaining * u.execRate) : 0;
  // 미수령·진행률은 '정산 청구액' 이 아니라 **수금 계획액** 대비다 (프로토타입과 같은 기준).
  const months = Object.keys(u?.undatedAllocation ?? {});
  const outstanding = Math.max(0, support.planned - support.received);
  const progress = support.planned ? support.received / support.planned : 0;

  return (
    <Card
      title="지원사업 정산 진행"
      sub={`정산 대상 ${support.lines}건 · 두 법인 합산 기준 (법인 선택과 무관)`}
    >
      <TileGrid>
        <MoneyTile label="정산 청구액" value={support.claimed} />
        <MoneyTile label="수금 계획액" value={support.planned} />
        <MoneyTile
          label="실제 수령액"
          value={support.received}
          tone="good"
          hint={`계획 대비 ${pct(progress)}`}
        />
        <MoneyTile label="잔여 채권" value={remaining} />
        <MoneyTile label="예상 회수 가능" value={expected} />
        <MoneyTile
          label="미수령"
          value={outstanding}
          tone="warn"
          hint={`계획 대비 ${pct(1 - progress)}`}
        />
      </TileGrid>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between text-[12px]">
          <span className="text-muted">수령 진행률 (수금 계획액 대비)</span>
          <span className="num font-[650]">{pct(progress)}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand-accent"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      </div>

      <AssumedNote>
        「예상 회수 가능」은 잔여 채권 {fmt(remaining)}원에 집행률{' '}
        {u ? pct(u.execRate) : '-'}를 곱한 <Badge tone="warn">추정</Badge> 값입니다.
        {months.length > 0 ? (
          <>
            {' '}
            현금흐름에는 <b className="text-secondary">과제의 정산 예정일</b>(적혀 있지 않으면 협약
            종료일 + 1개월)에 맞춰 {months.join(' · ')}에 나뉘어 들어갑니다. 정산 시점이 기간을 넘는
            과제는 넣지 않습니다 — 내년에 들어올 돈을 올해 런웨이에 넣지 않기 위해서입니다.
          </>
        ) : (
          <>
            {' '}
            과제에 종료일·정산 예정일이 없어 <b className="text-secondary">월별 배분 가정값</b>으로
            나눠 넣습니다. 과제에 날짜를 적으면 그 날짜로 잡힙니다.
          </>
        )}{' '}
        연령분석의 「회수예정일 미정」과는 모수와 집행률 반영 여부가 달라 값이 다릅니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 3.6 수주 확정 · 미청구 ───────────────────────────────────────── */
function WonUnbilled() {
  const { data, entity } = useStore();
  const rows = data.receivables.filter(
    (r) => r.stage === '청구전' && (entity == null || r.entity === entity),
  );

  return (
    <Card title="수주 확정 · 미청구" sub="계약은 됐고 아직 청구는 안 한 건">
      {rows.length === 0 ? (
        <Empty>해당하는 건이 없습니다.</Empty>
      ) : (
        <div className="scroll-x">
          <table className="min-w-[520px]">
            <thead>
              <tr>
                <th>건명</th>
                <th>법인</th>
                <th>입금예정일</th>
                <th>금액</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.counterparty}</td>
                  <td className="text-muted">{r.entity}</td>
                  <td className="text-muted">{r.dueDate ? mdate(r.dueDate) : '-'}</td>
                  <td className="font-[650]">{fmt(r.amountOpen)}</td>
                  <td>
                    {/* 되돌리기는 파이프라인에서 이관된 건만. 4단계(쓰기)에서 붙는다. */}
                    <span className="text-[11px] text-muted">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AssumedNote>
        「↩ 되돌리기」는 파이프라인에서 이관된 건에만 붙습니다. 지금은 읽기 전용 화면이라 표시하지
        않습니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 3.7 영업 파이프라인 ──────────────────────────────────────────── */
function Pipeline() {
  const { data, entity } = useStore();
  const rows = data.opportunities.filter((o) => entity == null || o.entity === entity);
  const weighted = rows.reduce((s, o) => s + Math.round(o.amountExpected * winRateOf(o)), 0);

  return (
    <Card title="영업 파이프라인" sub="수주 전">
      {rows.length === 0 ? (
        <Empty>해당하는 건이 없습니다.</Empty>
      ) : (
        <div className="scroll-x">
          <table className="min-w-[680px]">
            <thead>
              <tr>
                <th>건명</th>
                <th>법인</th>
                <th>품목</th>
                <th>영업단계</th>
                <th>예상 입금일</th>
                <th>예상금액</th>
                <th>확률</th>
                <th>가중금액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const rate = winRateOf(o);
                const manual = o.winRateOverride != null;
                return (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td className="text-muted">{o.entity}</td>
                    <td className="text-muted">{o.category ?? '-'}</td>
                    <td>
                      <Badge tone="brand">{o.salesStage}</Badge>
                    </td>
                    <td className="text-muted">{o.expectedDate ? mdate(o.expectedDate) : '-'}</td>
                    <td>{fmt(o.amountExpected)}</td>
                    <td>
                      <span className="num">{pct(rate)}</span>
                      {manual && (
                        <span className="ml-1">
                          <Badge tone="warn">직접</Badge>
                        </span>
                      )}
                    </td>
                    <td className="font-[650]">{fmt(Math.round(o.amountExpected * rate))}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="font-[650]">합계</td>
                <td colSpan={6} />
                <td className="font-[650]">{fmt(weighted)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <AssumedNote>
        확률은 영업단계 기본값(상담 30 / 견적 50 / 협상 70)이 붙고, 직접 적은 값이 있으면 그 값이
        우선합니다(<Badge tone="warn">직접</Badge>). 가중금액은 예상금액 × 확률인{' '}
        <Badge tone="warn">추정</Badge> 값입니다. 「수주확정 →」 이관은 4단계(쓰기)에서 붙습니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 3.8 주간 입금 계획 · 확실성 그룹 5개 ─────────────────────────── */
const GROUPS = [
  { id: 'overdue', label: '연체 채권 회수', hint: '회수예정일이 이미 지난 건' },
  { id: 'thisWeek', label: '이번 주 입금 계획', hint: '확정 채권' },
  { id: 'won', label: '수주 확정 · 미청구', hint: '계약O, 청구 전' },
  { id: 'pipe', label: '영업 파이프라인 · 확률 가중', hint: '금액 × 확률' },
  { id: 'assumed', label: '발생 예정 · 가정분', hint: '신규매출 가정 · 잔여 채권 배분' },
] as const;

function WeeklyPlan() {
  const s = useStore();
  const week = s.result.weeks[s.weekIndex];
  if (!week) return null;

  const grouped = GROUPS.map((g) => {
    const items = week.inflows.filter((i) => {
      if (g.id === 'overdue') return i.source === 'ar' && i.overdue && !i.assumed;
      if (g.id === 'thisWeek') return i.source === 'ar' && !i.overdue && !i.assumed;
      if (g.id === 'won') return i.source === 'won';
      if (g.id === 'pipe') return i.source === 'pipe';
      return i.assumed;
    });
    return { ...g, items, total: items.reduce((sum, i) => sum + i.amount, 0) };
  });

  return (
    <Card title="주간 입금 계획" sub={`${week.code} · ${week.label} · 확실성 순서`}>
      <div className="flex flex-col gap-2">
        {grouped.map((g) => (
          <details key={g.id} className="rounded-xl border border-line bg-surface-2 print-open">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="text-[13px] font-[650]">{g.label}</span>
                <span className="ml-1.5 text-[11px] text-muted">
                  {g.hint} · {g.items.length}건
                </span>
              </span>
              <span className="num shrink-0 text-[13.5px] font-[650]">{fmt(g.total)}</span>
            </summary>
            {g.items.length > 0 && (
              <div className="scroll-x border-t border-line">
                <table className="min-w-[420px]">
                  <tbody>
                    {g.items.map((i, k) => (
                      <tr key={`${i.name}-${k}`}>
                        <td>
                          {i.name}
                          {i.assumed && (
                            <span className="ml-1.5">
                              <Badge tone="warn">추정</Badge>
                            </span>
                          )}
                          {i.dueEstimated && !i.assumed && (
                            <span className="ml-1.5">
                              <Badge tone="muted">회수일 추정</Badge>
                            </span>
                          )}
                        </td>
                        <td className="text-muted">{i.entity}</td>
                        <td className="text-muted">{mdate(i.date)}</td>
                        <td>{fmt(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        ))}
      </div>
      <AssumedNote>
        계획액 합계 <b className="num text-secondary">{fmt(week.planned)}</b>원 중 달성률{' '}
        {Math.round(s.rate * 100)}%를 적용해 <b className="num text-secondary">{fmt(week.received)}</b>
        원이 실제로 들어온다고 봅니다. 회수예정일이 없는 건은 개별 건으로 넣지 않고 「발생 예정 ·
        가정분」으로 월별 배분합니다.
      </AssumedNote>
    </Card>
  );
}
