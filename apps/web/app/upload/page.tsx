import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentOrg, listEntities, listMyOrgs } from '@/lib/org';
import { Uploader } from '@/components/uploader';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const orgs = await listMyOrgs();
  if (orgs.length === 0) redirect('/onboarding');

  const org = (await getCurrentOrg(orgs))!;
  const entities = await listEntities(org.id);
  const asOf = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-[900px] px-3 pb-16 pt-4 sm:px-5">
      <header className="mb-4">
        <Link href="/" className="text-[12.5px] text-brand underline">
          ← 자금 현황으로
        </Link>
        <h1 className="mt-1 text-[17px] font-[650] leading-tight">영업관리 파일 업로드</h1>
        <p className="mt-0.5 text-[12px] text-muted">
          {org.name} · 기준일 {asOf}
        </p>
      </header>

      {entities.length === 0 && (
        <div className="mb-3 rounded-[16px] border border-line bg-warn-soft px-4 py-3 text-[13px] leading-relaxed">
          <b>먼저 법인을 등록해 주세요.</b> 파일의 「법인」 열이 등록된 법인과 맞는지 검사합니다.{' '}
          <Link href="/settings" className="text-brand underline">
            회사 설정으로
          </Link>
        </div>
      )}

      <Uploader orgId={org.id} entities={entities.map((e) => e.name)} asOf={asOf} />
    </div>
  );
}
