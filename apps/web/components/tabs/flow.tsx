'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { runCashflow, type Period } from 'cashflow-engine';
import { PRESETS, useStore } from '@/lib/store';
import { fmt, won } from '@/lib/format';
import { AssumedNote, Card } from '@/components/ui';

export function FlowTab() {
  const s = useStore();
  const periods = s.gran === 'week' ? s.result.weeks : s.result.months;

  return (
    <>
      <RunwayChart />

      <Card
        title={s.gran === 'week' ? '주차별 상세' : '월별 요약'}
        sub="행을 누르면 기준주차가 바뀝니다"
      >
        <PeriodTable periods={periods} />
      </Card>
    </>
  );
}

/* ── 런웨이 차트 ──────────────────────────────────────────────────── */
function RunwayChart() {
  const s = useStore();
  const warnLine = s.data.defaults.warnLine;

  const rows = useMemo(() => {
    const base = s.gran === 'week' ? s.result.weeks : s.result.months;
    // 나머지 프리셋은 회색 점선으로 같이 그린다
    const presets = PRESETS.map((p) => {
      const r = runCashflow(s.buildInput({ achievementRate: p.rate }));
      return { rate: p.rate, periods: s.gran === 'week' ? r.weeks : r.months };
    });
    return base.map((w, i) => {
      const row: Record<string, number | string> = { code: w.code, label: w.label, cash: w.cash };
      presets.forEach((p) => {
        row[`p${Math.round(p.rate * 100)}`] = p.periods[i]?.cash ?? 0;
      });
      return row;
    });
  }, [s]);

  const current = Math.round(s.rate * 100);

  return (
    <Card
      title="런웨이"
      sub={`선택 조건(${current}%)이 굵은 선, 나머지 프리셋이 회색 점선입니다`}
    >
      <div className="scroll-x">
        <div className="h-[280px] min-w-[520px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 6, right: 8, bottom: 4, left: 4 }}
              onClick={(e) => {
                const i = e?.activeTooltipIndex;
                if (typeof i === 'number' && s.gran === 'week') s.set({ weekIndex: i });
              }}
            >
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="code"
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                stroke="var(--line)"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                stroke="var(--line)"
                width={54}
                tickFormatter={(v: number) => won(v).replace('원', '')}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--text-secondary)' }}
                formatter={(v: number, name: string) => [
                  `${fmt(v)}원`,
                  name === 'cash' ? `선택 ${current}%` : `${name.replace('p', '')}%`,
                ]}
              />
              {/* 안전선 */}
              <ReferenceLine
                y={warnLine}
                stroke="var(--warn)"
                strokeDasharray="4 4"
                label={{ value: '안전선', position: 'insideTopLeft', fontSize: 11, fill: 'var(--warn)' }}
              />
              <ReferenceLine y={0} stroke="var(--crit)" strokeWidth={1} />
              {PRESETS.map((p) => (
                <Line
                  key={p.rate}
                  type="monotone"
                  dataKey={`p${Math.round(p.rate * 100)}`}
                  stroke="var(--text-muted)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
              <Line
                type="monotone"
                dataKey="cash"
                stroke="var(--c1)"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: 'var(--c1)' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <AssumedNote>
        {s.result.bottom
          ? `${s.result.bottom.code}(${s.result.bottom.label})에 잔고가 0 아래로 내려갑니다. 최저는 ${s.result.min.code} ${fmt(s.result.min.cash)}원입니다.`
          : `기간 안에 잔고가 0 아래로 내려가지 않습니다. 최저는 ${s.result.min.code} ${fmt(s.result.min.cash)}원입니다.`}
        {s.gran === 'week' && ' 점을 누르면 그 주가 기준주차가 됩니다.'}
      </AssumedNote>
    </Card>
  );
}

/* ── 표 · 공통 열 ─────────────────────────────────────────────────── */
function PeriodTable({ periods }: { periods: Period[] }) {
  const s = useStore();
  const warnLine = s.data.defaults.warnLine;
  const activeCode = s.result.weeks[s.weekIndex]?.code;

  return (
    <div className="scroll-x">
      <table className="min-w-[720px]">
        <thead>
          <tr>
            <th>{s.gran === 'week' ? '주차' : '월'}</th>
            <th>기간</th>
            <th>기초</th>
            <th>계획</th>
            <th>실입금</th>
            <th>고정비</th>
            <th>기타지출</th>
            <th>순증감</th>
            <th>기말</th>
            <th>이월</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p, i) => {
            const on = s.gran === 'week' && p.code === activeCode;
            const tone =
              p.cash < 0 ? 'var(--crit)' : p.cash < warnLine ? 'var(--warn)' : undefined;
            return (
              <tr
                key={p.code}
                onClick={() => s.gran === 'week' && s.set({ weekIndex: i })}
                className={clsx(
                  s.gran === 'week' && 'cursor-pointer hover:bg-surface-2',
                  on && 'bg-brand-soft',
                )}
              >
                <td className="font-[650]">
                  {p.code}
                  {p.monthWeek != null && (
                    <span className="ml-1 text-[11px] text-muted">
                      {p.month} {p.monthWeek}주
                    </span>
                  )}
                </td>
                <td className="text-muted">{p.label}</td>
                <td>{fmt(p.openingCash)}</td>
                <td className="text-muted">{fmt(p.planned)}</td>
                <td>{fmt(p.received)}</td>
                <td>{fmt(p.fixedCost)}</td>
                <td>{fmt(p.expense)}</td>
                <td style={{ color: p.net < 0 ? 'var(--crit)' : undefined }}>{fmt(p.net)}</td>
                <td className="font-[650]" style={{ color: tone }}>
                  {fmt(p.cash)}
                </td>
                <td className="text-muted">{fmt(p.carry)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
