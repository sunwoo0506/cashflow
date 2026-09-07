'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Phase = 'email' | 'sent' | 'code';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('email');
  const [busy, setBusy] = useState(false);
  // 콜백에서 실패해 돌아온 경우 그 이유를 그대로 보여준다
  const [error, setError] = useState<string | null>(params.get('error'));

  const configured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setPhase('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : '메일을 보내지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : '코드가 맞지 않습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <h1 className="text-[20px] font-[750] leading-tight">자금관리</h1>
        <p className="mt-1 text-[13px] text-secondary">
          회사 자금 현황과 런웨이를 보는 곳입니다.
        </p>
      </div>

      {params.get('error') && (
        <div className="mb-3 rounded-[16px] border border-line bg-crit-soft px-4 py-3 text-[12.5px] leading-relaxed text-crit">
          로그인하지 못했습니다 — {params.get('error')}
          <br />
          <span className="text-secondary">메일을 다시 받아 최신 링크를 눌러 주세요.</span>
        </div>
      )}

      {!configured ? (
        <div className="rounded-[16px] border border-line bg-crit-soft px-4 py-4 text-[13px] leading-relaxed text-crit">
          Supabase 환경변수가 설정되지 않아 로그인을 켤 수 없습니다.
          <br />
          <code className="text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> ·{' '}
          <code className="text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 넣어 주세요.
        </div>
      ) : phase === 'email' ? (
        <form
          onSubmit={sendLink}
          className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]"
        >
          <label className="block text-[12.5px] font-[650]" htmlFor="email">
            회사 이메일
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-[color:var(--brand-accent)]"
          />
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            비밀번호가 없습니다. 입력하신 주소로 <b className="text-secondary">로그인 링크</b>를
            보내드립니다.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-brand-accent px-3 py-2.5 text-[14px] font-[650] text-white disabled:opacity-60"
          >
            {busy ? '보내는 중…' : '로그인 링크 받기'}
          </button>
          {error && <p className="mt-2 text-[12.5px] text-crit">{error}</p>}
        </form>
      ) : phase === 'sent' ? (
        <div className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
          <p className="text-[14px] font-[650]">메일을 보냈습니다</p>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">
            <b>{email}</b> 로 보낸 메일의 링크를 누르면 로그인됩니다.
            <br />
            메일이 안 보이면 스팸함을 확인해 주세요.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={() => setPhase('code')}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] font-[550]"
            >
              링크 대신 인증코드 입력하기
            </button>
            <button
              onClick={() => {
                setPhase('email');
                setError(null);
              }}
              className="text-[12.5px] text-muted underline"
            >
              다른 주소로 다시 받기
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={verifyCode}
          className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]"
        >
          <label className="block text-[12.5px] font-[650]" htmlFor="code">
            메일에 적힌 인증코드
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="num mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[16px] tracking-[0.3em] outline-none focus:border-[color:var(--brand-accent)]"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-brand-accent px-3 py-2.5 text-[14px] font-[650] text-white disabled:opacity-60"
          >
            {busy ? '확인 중…' : '로그인'}
          </button>
          {error && <p className="mt-2 text-[12.5px] text-crit">{error}</p>}
          <button
            type="button"
            onClick={() => setPhase('sent')}
            className="mt-2 w-full text-[12.5px] text-muted underline"
          >
            뒤로
          </button>
        </form>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        회사 데이터는 로그인한 사람이 속한 회사의 것만 보입니다.
      </p>
    </main>
  );
}
