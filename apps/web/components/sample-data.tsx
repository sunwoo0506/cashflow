'use client';

import { useState, useTransition } from 'react';
import { applySampleData, clearOrgData, type SeedResult } from '@/lib/seed-actions';

export function SampleDataButton({
  orgId,
  hasData,
  variant = 'primary',
}: {
  orgId: string;
  hasData: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const [res, setRes] = useState<SeedResult | null>(null);
  const [pending, start] = useTransition();

  const cls =
    variant === 'primary'
      ? 'rounded-lg bg-brand-accent px-3 py-2 text-[13px] font-[650] text-white disabled:opacity-60'
      : 'rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-[550] disabled:opacity-60';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={cls}
          disabled={pending || hasData}
          title={hasData ? '이미 데이터가 있는 회사에는 넣지 않습니다' : undefined}
          onClick={() => start(async () => setRes(await applySampleData(orgId)))}
        >
          {pending ? '넣는 중…' : '샘플 데이터 적용하기'}
        </button>

        {hasData && (
          <button
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-[550] text-crit disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              if (!confirm('이 회사의 채권·지출·고정비·가정값을 모두 지웁니다. 계속할까요?')) return;
              start(async () => setRes(await clearOrgData(orgId)));
            }}
          >
            데이터 비우기
          </button>
        )}
      </div>

      {res && (
        <p className={`mt-2 text-[12.5px] ${res.ok ? 'text-good' : 'text-crit'}`}>{res.message}</p>
      )}
    </div>
  );
}
