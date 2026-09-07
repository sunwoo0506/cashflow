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

export default async function SettingsPage() {
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
    </div>
  );
}
