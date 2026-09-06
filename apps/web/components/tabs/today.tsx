'use client';

import clsx from 'clsx';
import { runCashflow } from 'cashflow-engine';
import { useMemo } from 'react';
import { PRESETS, SOURCE_META, useStore, verdictOf } from '@/lib/store';
import { fmt, kdate, won } from '@/lib/format';
import { AssumedNote, Badge, Card, MoneyTile, TileGrid, Verdict } from '@/components/ui';

export function TodayTab() {
  const s = useStore();
  const { result, data } = s;
  const week = result.weeks[s.weekIndex];
  const v = verdictOf(result, data.defaults.warnLine);

  return (
    <>
      {/* 1.1 결론 배너 */}
      <Verdict tone={v.tone} icon={v.icon} title={v.title}>
        {v.tone === 'crit' && result.bottom ? (
          <>
            {kdate(result.bottom.start)}에 통장이 바닥납니다
            <span className="mt-1 block text-[14px] font-[550] text-secondary">
              필요 금액 <b className="num text-primary">{fmt(v.need)}</b>원 · 안전선{' '}
              {won(data.defaults.warnLine)}까지 메우려면
            </span>
          </>
        ) : v.tone === 'warn' ? (
          <>
            최저 잔고 <span className="num">{fmt(result.min.cash)}</span>원
            <span className="mt-1 block text-[14px] font-[550] text-secondary">
              {result.min.code} ({kdate(result.min.start)}) · 안전선보다{' '}
              <b className="num text-primary">{fmt(v.need)}</b>원 부족
            </span>
          </>
        ) : (
          <>
            최저 잔고 <span className="num">{fmt(result.min.cash)}</span>원
            <span className="mt-1 block text-[14px] font-[550] text-secondary">
              {result.min.code} ({kdate(result.min.start)}) · 안전선보다{' '}
              <b className="num text-primary">{fmt(result.min.cash - data.defaults.warnLine)}</b>원
              여유
            </span>
          </>
        )}
      </Verdict>

      {/* 1.2 자금 현황 타일 */}
      <Card title="자금 현황" sub={week ? `${week.code} · ${week.label}` : undefined}>
        {week && (
          <TileGrid>
            <MoneyTile label="가용 예산 (주 시작)" value={week.openingCash} />
            <MoneyTile label="들어올 돈" value={week.received} />
            <MoneyTile label="고정비 지출" value={-week.fixedCost} />
            <MoneyTile label="고정비 외 지출" value={-week.expense} />
            <MoneyTile
              label="주간 손익"
              value={week.net}
              tone={week.net < 0 ? 'crit' : 'good'}
            />
            <MoneyTile
              label="주말 잔고"
              value={week.cash}
              tone={
                week.cash < 0 ? 'crit' : week.cash < data.defaults.warnLine ? 'warn' : 'good'
              }
            />
          </TileGrid>
        )}
      </Card>

      <SourceToggles />
      <RatePresets />
      <Preparation />
    </>
  );
}

/* ── 1.3 어디까지 넣고 볼까 ───────────────────────────────────────── */
function SourceToggles() {
  const s = useStore();
  const diff = s.result.min.cash - s.arOnly.min.cash;
  const bothOn = s.sources.pipe && s.sources.newSales;

  return (
    <Card
      title="어디까지 넣고 볼까"
      sub="각 버튼의 숫자는 그 소스만 켰을 때의 기간 총유입입니다"
    >
      <div className="grid grid-cols-2 gap-2 min-[820px]:grid-cols-4">
        {SOURCE_META.map((m) => {
          const on = s.sources[m.key];
          const only = Object.values(s.sources).filter(Boolean).length === 1 && on;
          return (
            <button
              key={m.key}
              onClick={() => s.toggleSource(m.key)}
              aria-pressed={on}
              disabled={only}
              title={only ? '최소 한 개는 켜져 있어야 합니다' : undefined}
              className={clsx(
                'rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
                on
                  ? 'border-[color:var(--brand-accent)] bg-brand-soft'
                  : 'border-line bg-surface-2 hover:border-[color:var(--brand-line)]',
                only && 'cursor-not-allowed opacity-90',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span aria-hidden className={on ? 'text-brand' : 'text-muted'}>
                  {on ? '☑' : '☐'}
                </span>
                <span className="text-[13px] font-[650]">{m.label}</span>
              </div>
              <div className="num mt-1 text-[15px] font-[750]">{fmt(s.sourceTotals[m.key])}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted">{m.what}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted">반영: {m.how}</div>
            </button>
          );
        })}
      </div>

      <AssumedNote>
        확정 채권만 봤을 때보다 최저 잔고가{' '}
        <b className="num text-secondary">{fmt(Math.abs(diff))}</b>원{' '}
        {diff >= 0 ? '높습니다' : '낮습니다'}.
        {bothOn && (
          <>
            {' '}
            파이프라인과 신규매출 가정을 함께 켰으므로,{' '}
            <b className="text-secondary">신규매출 월 목표에서 그 달 파이프라인 기대값을 뺐습니다</b>{' '}
            (이중계산 방지).
          </>
        )}{' '}
        파이프라인·신규매출 가정은 <Badge tone="warn">추정</Badge> 값입니다.
      </AssumedNote>
    </Card>
  );
}

/* ── 1.4 달성률 ───────────────────────────────────────────────────── */
function RatePresets() {
  const s = useStore();
  const warnLine = s.data.defaults.warnLine;

  const cards = useMemo(
    () =>
      PRESETS.map((p) => {
        const r = runCashflow(s.buildInput({ achievementRate: p.rate }));
        const v = verdictOf(r, warnLine);
        return { ...p, r, v };
      }),
    [s, warnLine],
  );

  return (
    <Card title="달성률" sub="계획한 입금 중 실제로 들어온다고 보는 비율">
      <div className="grid grid-cols-2 gap-2 min-[820px]:grid-cols-4">
        {cards.map((c) => {
          const on = Math.abs(s.rate - c.rate) < 0.005;
          const vc =
            c.v.tone === 'good'
              ? 'var(--good)'
              : c.v.tone === 'warn'
                ? 'var(--warn)'
                : 'var(--crit)';
          return (
            <button
              key={c.name}
              onClick={() => s.set({ rate: c.rate })}
              aria-pressed={on}
              className={clsx(
                'rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
                on
                  ? 'border-[color:var(--brand-accent)] bg-brand-soft'
                  : 'border-line bg-surface-2 hover:border-[color:var(--brand-line)]',
              )}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[13px] font-[650]">{c.name}</span>
                <span className="num text-[12px] text-muted">{Math.round(c.rate * 100)}%</span>
              </div>
              <div
                className="mt-1 flex items-center gap-1 text-[12px] font-[650]"
                style={{ color: vc }}
              >
                <span aria-hidden>●</span>
                <span>{c.v.title === '위험' ? '부족' : c.v.title}</span>
              </div>
              <div className="num mt-0.5 text-[13px] font-[650]">{fmt(c.r.min.cash)}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted">
                {c.r.bottom
                  ? `${c.r.bottom.code} 바닥 · 부족 ${won(c.r.shortfall)}`
                  : c.r.shortfall > 0
                    ? `부족 ${won(c.r.shortfall)}`
                    : `${c.r.min.code} 최저`}
              </div>
            </button>
          );
        })}
      </div>
      <AssumedNote>
        현재 {Math.round(s.rate * 100)}%. 매주 계획액의 그만큼만 들어오고 나머지는 다음 주로
        이월됩니다. 기간 말 미회수 <b className="num text-secondary">{fmt(s.result.unpaid)}</b>원.
      </AssumedNote>
    </Card>
  );
}

/* ── 1.5 준비사항 ─────────────────────────────────────────────────── */
function Preparation() {
  const s = useStore();
  const { result } = s;

  /** ② 수금 재촉으로 확보할 금액 = 기준일보다 늦은 채권 */
  const overdue = result.weeks
    .flatMap((w) => w.inflows)
    .filter((i) => i.overdue)
    .reduce((sum, i) => sum + i.amount, 0);

  /** ③ 지출 조정으로 확보할 폭 = 최저 시점까지의 고정비 외 지출 */
  const minIdx = result.weeks.findIndex((w) => w.code === result.min.code);
  const adjustable = result.weeks
    .slice(0, minIdx + 1)
    .reduce((sum, w) => sum + w.expense, 0);

  return (
    <Card title="준비사항">
      <div className="grid gap-2 min-[640px]:grid-cols-3">
        <MoneyTile label="① 마련해야 할 금액" value={result.shortfall} tone={result.shortfall > 0 ? 'crit' : 'good'} />
        <MoneyTile label="② 수금 재촉으로 확보" value={overdue} />
        <MoneyTile label="③ 지출 조정으로 확보" value={adjustable} />
      </div>
      <AssumedNote>
        ② 는 회수예정일이 기준일({s.data.asOf})보다 지난 채권입니다 — 이미 늦은 돈이라 지금 받는다고
        보고 기준일 주차에 넣었습니다. ③ 은 최저 시점({result.min.code})까지의 고정비 외 지출
        합계로, 미루거나 취소할 수 있는 폭의 상한입니다.
      </AssumedNote>
    </Card>
  );
}
