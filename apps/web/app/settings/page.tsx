import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentOrg, getUserEmail, listEntities, listMembers, listMyOrgs } from '@/lib/org';
import { SampleDataButton } from '@/components/sample-data';
import { PasswordForm } from '@/components/password-form';
import { getOrgDataset } from '@/lib/data';
import {
  CreateOrgForm,
  EntityManager,
  MemberManager,
  RenameOrgForm,
  SettingsCard,
} from '@/components/org-forms';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const justCreated = (await searchParams).created === '1';
  const orgs = await listMyOrgs();
  if (orgs.length === 0) redirect('/onboarding');

  const org = (await getCurrentOrg(orgs))!;
  const [entities, members, email, data] = await Promise.all([
    listEntities(org.id),
    listMembers(org.id),
    getUserEmail(),
    getOrgDataset(org.id),
  ]);
  const hasData = data.receivables.length > 0 || data.fixedCosts.length > 0;

  return (
    <div className="mx-auto w-full max-w-[820px] px-3 pb-16 pt-4 sm:px-5">
      <header className="mb-4">
        <Link href="/" className="text-[12.5px] text-brand underline">
          ← 자금 현황으로
        </Link>
        <h1 className="mt-1 text-[17px] font-[650] leading-tight">회사 설정</h1>
        <p className="mt-0.5 text-[12px] text-muted">
          {org.name} · 내 역할{' '}
          {{ owner: '소유자', manager: '관리자', staff: '담당자', viewer: '조회만' }[org.role]}
        </p>
      </header>

      {justCreated && (
        <div className="mb-3 rounded-[16px] border border-line bg-brand-soft px-4 py-4 text-[13px] leading-relaxed">
          <b className="text-[14px]">회사를 만들었습니다.</b>
          <p className="mt-1 text-secondary">
            이제 <b>법인</b>을 등록하고, <b>샘플 데이터</b>로 둘러보거나 <b>파일 업로드</b>로 실제
            원장을 넣으면 됩니다. 다 건너뛰고 바로 화면을 봐도 됩니다.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SettingsCard title="회사 정보" sub="화면 맨 위에 이 이름이 나옵니다">
          {org.role === 'owner' ? (
            <RenameOrgForm org={org} />
          ) : (
            <p className="text-[13px] text-secondary">
              {org.name}
              <span className="ml-2 text-[12px] text-muted">이름 변경은 소유자만 할 수 있습니다</span>
            </p>
          )}
        </SettingsCard>

        <SettingsCard
          title="법인"
          sub="한 회사 아래 여러 법인을 둘 수 있습니다. 여기 추가하면 화면 상단 필터에 나타납니다"
        >
          <EntityManager orgId={org.id} entities={entities} />
        </SettingsCard>

        <SettingsCard title="멤버" sub="이 회사의 자금 데이터를 볼 수 있는 사람">
          <MemberManager
            orgId={org.id}
            members={members}
            myRole={org.role}
            myEmail={email}
          />
        </SettingsCard>

        <SettingsCard
          title="샘플 데이터"
          sub="기능을 둘러보려면 가상 데이터를 한 번에 넣을 수 있습니다 (실제 거래 정보가 아닙니다)"
        >
          <SampleDataButton orgId={org.id} hasData={hasData} variant="ghost" />
        </SettingsCard>

        <SettingsCard
          title="회사 추가"
          sub="여러 회사를 관리한다면 새로 만들어 화면 위에서 전환할 수 있습니다"
        >
          <CreateOrgForm compact />
        </SettingsCard>

        <SettingsCard title="계정" sub="비밀번호를 정해 두면 메일 없이 로그인할 수 있습니다">
          <p className="mb-3 text-[13px] text-secondary">{email}</p>
          <PasswordForm />
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-[550]">
              로그아웃
            </button>
          </form>
        </SettingsCard>
      </div>

      {/* 설정을 마쳤으면 본 화면으로 — 위쪽 작은 링크만으로는 놓치기 쉽다 */}
      <div className="mt-4 rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
        <p className="text-[13px] leading-relaxed text-secondary">
          {hasData ? (
            <>설정이 끝났습니다. 자금 현황에서 런웨이를 확인하세요.</>
          ) : entities.length === 0 ? (
            <>
              아직 <b>법인</b>도 <b>자금 데이터</b>도 없습니다. 위에서 법인을 추가하거나, 샘플
              데이터를 넣어 기능을 먼저 둘러보세요.
            </>
          ) : (
            <>
              법인은 등록됐습니다. 이제 <b>샘플 데이터</b>를 넣거나 <b>파일 업로드</b>로 실제
              원장을 넣으면 런웨이가 그려집니다.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-lg bg-brand-accent px-4 py-2.5 text-[14px] font-[650] text-white"
          >
            자금 현황 보기
          </Link>
          <Link
            href="/upload"
            className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-[13.5px] font-[550] text-secondary hover:text-primary"
          >
            파일 업로드
          </Link>
        </div>
      </div>
    </div>
  );
}
