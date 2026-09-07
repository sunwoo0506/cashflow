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

/** 메일 링크 · 비밀번호 두 가지로 들어올 수 있다 */
type Mode = 'password' | 'link';
type Phase = 'form' | 'sent' | 'code';

const inputCls =
  'mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-[color:var(--brand-accent)]';
const primaryCls =
  'mt-3 w-full rounded-lg bg-brand-accent px-3 py-2.5 text-[14px] font-[650] text-white disabled:opacity-60';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [mode, setMode] = useState<Mode>('password');
  const [signUp, setSignUp] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error'));
  const [notice, setNotice] = useState<string | null>(null);
  /** 링크가 돌아올 주소. Supabase 허용 목록에 없으면 Site URL 로 튕긴다 */
  const [callbackOrigin, setCallbackOrigin] = useState<string | null>(null);

  const configured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  /** Supabase 원문 오류를 무엇을 해야 하는지가 보이는 문장으로 바꾼다 */
  const explain = (message: string): string => {
    if (/provider.*disabled|signups are disabled|logins are disabled/i.test(message)) {
      return (
        '이메일 로그인이 꺼져 있습니다. ' +
        '관리자가 Supabase → Authentication → Sign In / Providers → Email 에서 ' +
        '「Email」 제공자를 켜야 합니다. (확인 메일이 필요 없으면 Confirm email 은 꺼 두세요)'
      );
    }
    if (/rate limit/i.test(message)) {
      return (
        '메일 발송 한도에 걸렸습니다. 잠시 뒤 다시 시도하거나, 비밀번호로 로그인해 주세요. ' +
        '(관리자: Confirm email 을 끄면 가입 시 메일을 보내지 않습니다)'
      );
    }
    return message;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(explain(err instanceof Error ? err.message : '처리하지 못했습니다'));
    } finally {
      setBusy(false);
    }
  };

  /* ── 비밀번호 — 메일을 안 보내므로 발송 한도와 무관하다 ────── */
  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const supabase = createClient();
      if (signUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) {
          // 이미 있는 계정이면 가입이 아니라 로그인을 해야 한다
          if (/already registered|already been registered/i.test(error.message)) {
            setSignUp(false);
            throw new Error('이미 가입된 주소입니다. 아래에서 비밀번호로 로그인해 주세요.');
          }
          throw error;
        }
        if (data.session) {
          window.location.href = next;
          return;
        }
        // 메일 확인이 켜져 있으면 세션이 바로 안 나온다
        setNotice('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 비밀번호로 로그인하세요.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          // 메일 링크로 만든 계정은 비밀번호가 없다
          if (/invalid login credentials/i.test(error.message)) {
            throw new Error(
              '이메일 또는 비밀번호가 맞지 않습니다. ' +
                '메일 링크로 만든 계정이라면 아직 비밀번호가 없습니다 — ' +
                '로그인 후 「회사 설정 → 계정」에서 정할 수 있습니다.',
            );
          }
          throw error;
        }
        window.location.href = next;
      }
    });
  };

  /* ── 메일 링크 ────────────────────────────────────────────── */
  const sendLink = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setCallbackOrigin(window.location.origin);
      setPhase('sent');
    });
  };

  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      window.location.href = next;
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <div className="mb-5">
        <h1 className="text-[20px] font-[750] leading-tight">자금관리</h1>
        <p className="mt-1 text-[13px] text-secondary">회사 자금 현황과 런웨이를 보는 곳입니다.</p>
      </div>

      {error && (
        <div className="mb-3 rounded-[16px] border border-line bg-crit-soft px-4 py-3 text-[12.5px] leading-relaxed text-crit">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-[16px] border border-line bg-brand-soft px-4 py-3 text-[12.5px] leading-relaxed text-brand">
          {notice}
        </div>
      )}

      {!configured ? (
        <div className="rounded-[16px] border border-line bg-crit-soft px-4 py-4 text-[13px] leading-relaxed text-crit">
          Supabase 환경변수가 설정되지 않아 로그인을 켤 수 없습니다.
        </div>
      ) : (
        <>
          {/* 방식 고르기 */}
          <div
            role="radiogroup"
            aria-label="로그인 방식"
            className="mb-2 inline-flex rounded-lg border border-line bg-surface-2 p-[3px]"
          >
            {(
              [
                ['password', '비밀번호'],
                ['link', '메일 링크'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m);
                  setPhase('form');
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-[550] transition-colors ${
                  mode === m ? 'bg-brand-accent text-white' : 'text-secondary hover:text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'password' ? (
            <form
              onSubmit={submitPassword}
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
                className={inputCls}
              />

              <label className="mt-3 block text-[12.5px] font-[650]" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={signUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={signUp ? '6자 이상' : ''}
                className={inputCls}
              />

              <button type="submit" disabled={busy} className={primaryCls}>
                {busy ? '확인 중…' : signUp ? '가입하고 시작하기' : '로그인'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignUp(!signUp);
                  setError(null);
                  setNotice(null);
                }}
                className="mt-2 w-full text-[12.5px] text-muted underline"
              >
                {signUp ? '이미 계정이 있어요 — 로그인하기' : '계정이 없어요 — 가입하기'}
              </button>

              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                {signUp ? (
                  <>
                    가입은 <b className="text-secondary">확인 메일을 보낼 수 있어</b> 발송 한도에
                    걸릴 수 있습니다. 이미 계정이 있다면 아래에서 로그인으로 바꿔 주세요.
                  </>
                ) : (
                  <>
                    비밀번호 <b className="text-secondary">로그인</b>은 메일을 보내지 않아 발송
                    한도와 무관합니다.
                  </>
                )}
              </p>
            </form>
          ) : phase === 'form' ? (
            <form
              onSubmit={sendLink}
              className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]"
            >
              <label className="block text-[12.5px] font-[650]" htmlFor="emailLink">
                회사 이메일
              </label>
              <input
                id="emailLink"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={inputCls}
              />
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                입력하신 주소로 <b className="text-secondary">로그인 링크</b>를 보내드립니다. 무료
                플랜은 시간당 발송 수가 제한됩니다.
              </p>
              <button type="submit" disabled={busy} className={primaryCls}>
                {busy ? '보내는 중…' : '로그인 링크 받기'}
              </button>
            </form>
          ) : phase === 'sent' ? (
            <div className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
              <p className="text-[14px] font-[650]">메일을 보냈습니다</p>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">
                <b>{email}</b> 로 보낸 메일의 링크를 누르면 로그인됩니다.
                <br />
                메일이 안 보이면 스팸함을 확인해 주세요.
              </p>
              {callbackOrigin && (
                <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
                  링크는 <b className="text-secondary">{callbackOrigin}</b> 으로 돌아옵니다.
                  <br />
                  다른 주소로 열린다면 Supabase 의 <b>Redirect URLs</b> 에 이 주소가 없는 것입니다.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={() => setPhase('code')}
                  className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] font-[550]"
                >
                  메일에 6자리 코드가 함께 왔다면 입력하기
                </button>
                <p className="text-[11.5px] leading-relaxed text-muted">
                  코드는 메일 서식에 <code>{'{{ .Token }}'}</code> 이 들어 있을 때만 옵니다.
                </p>
                <button
                  onClick={() => setPhase('form')}
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
                className={`num ${inputCls} tracking-[0.3em]`}
              />
              <button type="submit" disabled={busy} className={primaryCls}>
                {busy ? '확인 중…' : '로그인'}
              </button>
              <button
                type="button"
                onClick={() => setPhase('sent')}
                className="mt-2 w-full text-[12.5px] text-muted underline"
              >
                뒤로
              </button>
            </form>
          )}
        </>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        회사 데이터는 로그인한 사람이 속한 회사의 것만 보입니다.
      </p>
    </main>
  );
}
