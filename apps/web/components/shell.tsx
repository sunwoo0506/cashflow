'use client';

import clsx from 'clsx';
import { TABS, useStore } from '@/lib/store';
import { Seg } from '@/components/ui';
import { fmt, kdate } from '@/lib/format';
import { TodayTab } from '@/components/tabs/today';
import { FlowTab } from '@/components/tabs/flow';
import { ReceivablesTab } from '@/components/tabs/receivables';
import { OutflowsTab } from '@/components/tabs/outflows';
import { OrgSwitcher } from '@/components/org-forms';
import type { Org } from '@/lib/org-types';

export function Shell({ orgs, org }: { orgs?: Org[]; org?: Org }) {
  const s = useStore();
  const week = s.result.weeks[s.weekIndex];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 pb-16 pt-4 sm:px-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 회사 이름은 고정값이 아니다 — 로그인한 사람이 보고 있는 회사가 나온다 */}
          {orgs && org ? (
            <OrgSwitcher orgs={orgs} current={org} />
          ) : (
            <h1 className="text-[17px] font-[650] leading-tight">자금관리</h1>
          )}
          <p className="mt-0.5 text-[12px] text-muted">
            기준 {s.data.asOf} · {s.data.defaults.startDate}부터 {s.data.defaults.weeks}주 ·{' '}
            {s.data.generatedFrom}
          </p>
        </div>
        <nav className="noprint flex shrink-0 items-center gap-1.5">
          <a
            href="/upload"
            className="rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px] font-[550] text-secondary hover:text-primary"
          >
            파일 업로드
          </a>
          <a
            href="/settings"
            className="rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px] font-[550] text-secondary hover:text-primary"
          >
            회사 설정
          </a>
        </nav>
      </header>

      {/* 전역 컨트롤 — 탭 밖에 고정. 탭을 옮겨도 유지된다. */}
      <GlobalControls />

      {/* 탭 바 — sticky, 모바일 가로 스크롤, 부제 숨김 */}
      <nav className="noprint sticky top-0 z-20 -mx-3 mb-3 bg-bg/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="scroll-x flex gap-1.5">
          {TABS.map((t) => {
            const on = t.id === s.tab;
            return (
              <button
                key={t.id}
                onClick={() => s.set({ tab: t.id })}
                aria-current={on ? 'page' : undefined}
                className={clsx(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors',
                  on
                    ? 'border-transparent bg-brand-accent text-white'
                    : 'border-line bg-surface-1 text-secondary hover:text-primary',
                )}
              >
                <span className="block text-[13px] font-[650] leading-tight">{t.label}</span>
                <span
                  className={clsx(
                    'hidden text-[11px] leading-tight min-[640px]:block',
                    on ? 'text-white/80' : 'text-muted',
                  )}
                >
                  {t.sub}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex flex-col gap-3">
        {s.tab === 'today' && <TodayTab />}
        {s.tab === 'flow' && <FlowTab />}
        {s.tab === 'in' && <ReceivablesTab />}
        {s.tab === 'out' && <OutflowsTab />}
      </main>

      <footer className="mt-6 text-[11.5px] leading-relaxed text-muted">
        기준주차 {week?.code} ({week ? `${week.start} ~ ${week.end}` : '-'}) ·{' '}
        {s.entity ?? '전체 법인 합산'} · {s.gran === 'week' ? '주간' : '월간'} 보기 · 달성률{' '}
        {Math.round(s.rate * 100)}%
        <br />
        읽기 전용 화면입니다. 이 회사에 속한 사람만 볼 수 있습니다.
      </footer>
    </div>
  );
}

function GlobalControls() {
  const s = useStore();
  const weeks = s.result.weeks;
  const week = weeks[s.weekIndex];

  return (
    <div className="noprint mb-3 flex flex-wrap items-center gap-2 rounded-[16px] border border-line bg-surface-1 px-3 py-2.5">
      {/* 법인은 회사 설정에서 등록한 것이 나온다 */}
      {s.data.entities.length > 0 && (
        <Seg
          label="법인"
          value={s.entity ?? '전체'}
          onChange={(v) => s.set({ entity: v === '전체' ? null : v })}
          options={[
            { value: '전체', label: '전체' },
            ...s.data.entities.map((e) => ({ value: e, label: e })),
          ]}
        />
      )}

      <Seg
        label="기간 단위"
        value={s.gran}
        onChange={(v) => s.set({ gran: v })}
        options={[
          { value: 'week' as const, label: '주간' },
          { value: 'month' as const, label: '월간' },
        ]}
      />

      <label className="flex items-center gap-1.5 text-[12px] text-secondary">
        <span className="text-muted">기준주차</span>
        <select
          value={s.weekIndex}
          onChange={(e) => s.set({ weekIndex: Number(e.target.value) })}
          className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[12.5px]"
        >
          {weeks.map((w, i) => (
            <option key={w.code} value={i}>
              {w.code} · {w.month} {w.monthWeek}주 ({w.label})
            </option>
          ))}
        </select>
      </label>

      <label className="ml-auto flex min-w-[210px] flex-1 items-center gap-2 text-[12px] sm:flex-none">
        <span className="text-muted">달성률</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(s.rate * 100)}
          onChange={(e) => s.set({ rate: Number(e.target.value) / 100 })}
          className="h-1 flex-1 accent-[color:var(--brand-accent)] sm:w-28 sm:flex-none"
          aria-label="달성률"
        />
        <span className="num w-9 text-right font-[650]">{Math.round(s.rate * 100)}%</span>
      </label>

      {week && (
        <p className="w-full text-[11.5px] text-muted">
          기준주차 {week.code} · {kdate(week.start)}~{kdate(week.end)} · 주말 잔고{' '}
          <b className="num text-secondary">{fmt(week.cash)}</b>
        </p>
      )}
    </div>
  );
}
