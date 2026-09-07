import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentOrg, getUserEmail, listMyOrgs } from '@/lib/org';
import { getOrgDataset } from '@/lib/data';
import { StoreProvider } from '@/lib/store';
import { Shell } from '@/components/shell';
import { isConfigured } from '@/lib/supabase/server';
import { SampleDataButton } from '@/components/sample-data';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (!isConfigured) return <NotConfigured />;

  const orgs = await listMyOrgs();
  if (orgs.length === 0) redirect('/onboarding');

  const org = (await getCurrentOrg(orgs))!;
  const [data, email] = await Promise.all([getOrgDataset(org.id), getUserEmail()]);

  const empty = data.receivables.length === 0 && data.fixedCosts.length === 0;

  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">불러오는 중…</div>}>
      <StoreProvider data={data}>
        {empty && <EmptyBanner orgId={org.id} />}
        <Shell orgs={orgs} org={org} email={email} />
      </StoreProvider>
    </Suspense>
  );
}

function EmptyBanner({ orgId }: { orgId: string }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 pt-4 sm:px-5">
      <div className="rounded-[16px] border border-line bg-brand-soft px-4 py-4 text-[13px] leading-relaxed">
        <b className="text-[14px]">아직 자금 데이터가 없습니다.</b>
        <p className="mt-1 text-secondary">
          기능을 먼저 둘러보시려면 <b>샘플 데이터</b>를 넣어 보세요. 가상의 회사 한 곳 분량입니다
          (실제 거래 정보가 아닙니다). 실제 원장은{' '}
          <Link href="/upload" className="text-brand underline">
            파일 업로드
          </Link>{' '}
          로 넣습니다.
        </p>
        <div className="mt-3">
          <SampleDataButton orgId={orgId} hasData={false} />
        </div>
        <p className="mt-2 text-[12px] text-muted">
          법인·거래처는 샘플이 알아서 만듭니다. 나중에{' '}
          <Link href="/settings" className="text-brand underline">
            회사 설정
          </Link>{' '}
          에서 바꿀 수 있습니다.
        </p>
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-5">
      <div className="rounded-[16px] border border-line bg-crit-soft px-4 py-4">
        <b className="text-[14px] text-crit">Supabase 환경변수가 없습니다</b>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">
          <code className="text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> 과{' '}
          <code className="text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 설정하면 로그인과
          회사별 데이터가 켜집니다.
        </p>
      </div>
    </main>
  );
}
