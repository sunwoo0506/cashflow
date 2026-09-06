import { redirect } from 'next/navigation';
import { listMyOrgs, getUserEmail } from '@/lib/org';
import { CreateOrgForm } from '@/components/org-forms';

/** 아직 어느 회사에도 속하지 않은 사람이 첫 회사를 만드는 곳 */
export default async function OnboardingPage() {
  const orgs = await listMyOrgs();
  if (orgs.length > 0) redirect('/');
  const email = await getUserEmail();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-5 py-10">
      <h1 className="text-[20px] font-[750] leading-tight">회사를 만들어 주세요</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-secondary">
        {email && (
          <>
            <b>{email}</b> 로 로그인했습니다.
            <br />
          </>
        )}
        아직 속한 회사가 없습니다. 회사를 만들면 그 회사의 자금 데이터를 관리하게 됩니다.
      </p>

      <div className="mt-4 rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
        <CreateOrgForm />
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        이미 동료가 회사를 만들었다면, 그 회사의 관리자에게 이 이메일 주소로 멤버 추가를 요청하세요.
        추가되면 다시 로그인할 필요 없이 바로 보입니다.
      </p>

      <form action="/auth/signout" method="post" className="mt-4">
        <button className="text-[12.5px] text-muted underline">다른 계정으로 로그인</button>
      </form>
    </main>
  );
}
