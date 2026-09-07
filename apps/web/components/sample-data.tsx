'use client';

import { useState, useTransition } from 'react';
import { applySampleData, clearOrgData, type SeedResult } from '@/lib/seed-actions';

/**
 * 샘플 데이터 넣기 · 데이터 비우기.
 *
 * 넣는 길만 있고 되돌리는 길이 없으면 시험 삼아 넣어 볼 수가 없다.
 * 비우기는 실수로 실제 원장을 지우는 일이 없게 한 번 더 확인을 받는다.
 */
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
  const [confirming, setConfirming] = useState(false);

  const applyCls =
    variant === 'primary'
      ? 'rounded-lg bg-brand-accent px-3 py-2 text-[13px] font-[650] text-white disabled:opacity-60'
      : 'rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-[550] disabled:opacity-60';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={applyCls}
          disabled={pending || hasData}
          title={hasData ? '이미 데이터가 있습니다. 먼저 비운 뒤 넣을 수 있습니다' : undefined}
          onClick={() => {
            setConfirming(false);
            start(async () => setRes(await applySampleData(orgId)));
          }}
        >
          {pending && !confirming ? '넣는 중…' : '샘플 데이터 적용하기'}
        </button>

        {!confirming ? (
          <button
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-[550] text-crit disabled:opacity-60"
            disabled={pending || !hasData}
            title={!hasData ? '지울 데이터가 없습니다' : undefined}
            onClick={() => setConfirming(true)}
          >
            데이터 비우기
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--crit)] bg-crit-soft px-2 py-1">
            <span className="text-[12px] text-crit">정말 비울까요?</span>
            <button
              className="rounded-md bg-crit px-2 py-1 text-[12px] font-[650] text-white disabled:opacity-60"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setRes(await clearOrgData(orgId));
                  setConfirming(false);
                })
              }
            >
              {pending ? '지우는 중…' : '비우기'}
            </button>
            <button
              className="rounded-md px-2 py-1 text-[12px] text-secondary"
              onClick={() => setConfirming(false)}
            >
              취소
            </button>
          </span>
        )}
      </div>

      {res && (
        <p className={`mt-2 text-[12.5px] leading-relaxed ${res.ok ? 'text-good' : 'text-crit'}`}>
          {res.message}
        </p>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        {hasData ? (
          <>
            비우기는 <b>채권 · 파이프라인 · 지출 · 고정비 · 가정값</b>을 지웁니다. 법인과 거래처는
            남습니다.
          </>
        ) : (
          <>
            샘플은 <b>가상 데이터</b>입니다 (실제 거래 정보가 아닙니다). 법인과 거래처도 함께
            만들어집니다.
          </>
        )}
      </p>
    </div>
  );
}
