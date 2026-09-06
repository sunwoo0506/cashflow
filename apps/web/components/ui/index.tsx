'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { fmt, won } from '@/lib/format';

/* ── Card · radius 16, surface-1, 1px line, padding 16/18 ─────────── */
export function Card({
  title,
  sub,
  right,
  children,
  className,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        'card rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]',
        className,
      )}
    >
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-[650] leading-tight">{title}</h2>}
            {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ── Tile · 6열 그리드 (≤820px 3열, ≤640px 2열) ───────────────────── */
export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 min-[640px]:grid-cols-3 min-[820px]:grid-cols-6">{children}</div>;
}

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'good' | 'warn' | 'crit';
}) {
  const color =
    tone === 'good'
      ? 'var(--good)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : 'var(--text-primary)';
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-[11.5px] leading-tight text-muted">{label}</div>
      <div
        className="num mt-1 font-[750] leading-tight"
        style={{ fontSize: 'clamp(15px, 1.6vw, 19px)', color }}
      >
        {typeof value === 'number' ? fmt(value) : value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

/** 금액 타일 — 본 숫자 아래 억/만 보조 표기를 자동으로 단다 */
export function MoneyTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'warn' | 'crit';
  hint?: string;
}) {
  return <Tile label={label} value={value} tone={tone} hint={hint ?? won(value)} />;
}

/* ── Badge · 11px, radius 4 ───────────────────────────────────────── */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'crit' | 'muted';
}) {
  const map: Record<string, string> = {
    neutral: 'border-line bg-surface-2 text-secondary',
    brand: 'border-[color:var(--brand-line)] bg-brand-soft text-brand',
    good: 'border-transparent bg-good-soft text-good',
    warn: 'border-transparent bg-warn-soft text-warn',
    crit: 'border-transparent bg-crit-soft text-crit',
    muted: 'border-line bg-surface-2 text-muted',
  };
  return (
    <span
      className={clsx(
        'inline-block rounded-[4px] border px-1.5 py-[1px] text-[11px] leading-[1.5] whitespace-nowrap',
        map[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ── Seg · 라디오형 세그먼트 ──────────────────────────────────────── */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-surface-2 p-[3px]"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-[12.5px] font-[550] transition-colors',
              on ? 'bg-brand-accent text-white' : 'text-secondary hover:text-primary',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Verdict · 좌측 6px 상태 바 ───────────────────────────────────── */
export function Verdict({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'good' | 'warn' | 'crit';
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  const vc = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : 'var(--crit)';
  const soft =
    tone === 'good' ? 'var(--good-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--crit-soft)';
  return (
    <section
      className="card overflow-hidden rounded-[16px] border border-line"
      style={{ background: soft, borderLeft: `6px solid ${vc}` }}
    >
      <div className="px-4 py-4 sm:px-[18px]">
        {/* 상태는 색 단독으로 표시하지 않는다 — 아이콘 + 글자를 같이 낸다 */}
        <div className="flex items-center gap-1.5 text-[13px] font-[650]" style={{ color: vc }}>
          <span aria-hidden>{icon}</span>
          <span>{title}</span>
        </div>
        <div
          className="mt-1 font-[750] leading-[1.25]"
          style={{ fontSize: 'clamp(20px, 3.2vw, 29px)' }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/* ── StackBar · 세그먼트 사이 2px 표면 갭, 8% 이상만 직접 라벨 ────── */
export function StackBar({
  parts,
  height = 30,
}: {
  parts: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return <div className="text-[12px] text-muted">표시할 금액이 없습니다.</div>;
  return (
    <div className="flex w-full gap-[2px]" style={{ height }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => {
          const share = p.value / total;
          return (
            <div
              key={p.label}
              title={`${p.label} ${fmt(p.value)}원`}
              className="flex items-center justify-center overflow-hidden rounded-[4px] px-1 text-[11px] font-[600] text-white"
              style={{ width: `${share * 100}%`, background: p.color }}
            >
              {share >= 0.08 && <span className="truncate">{p.label}</span>}
            </div>
          );
        })}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: number }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-secondary">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ background: i.color }}
          />
          <span>{i.label}</span>
          {i.value != null && <span className="num text-muted">{fmt(i.value)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** 가정으로 만든 값이라는 표시 (CLAUDE.md 규칙 4) */
export const AssumedNote = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-[12px] leading-relaxed text-muted">{children}</p>
);

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-6 text-center text-[12.5px] leading-relaxed text-muted">
      {children}
    </div>
  );
}
