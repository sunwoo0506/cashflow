'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * 비밀번호 설정·변경.
 *
 * 메일 링크로 만든 계정은 비밀번호가 없다. 여기서 한 번 정해 두면
 * 메일 발송 한도와 무관하게 로그인할 수 있다.
 */
export function PasswordForm() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setMsg({ ok: true, text: '비밀번호를 저장했습니다. 다음부터 이 비밀번호로 로그인하세요.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[200px] flex-1">
        <label className="text-[12.5px] font-[650]" htmlFor="newPassword">
          새 비밀번호
        </label>
        <input
          id="newPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="6자 이상"
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-[color:var(--brand-accent)]"
        />
      </div>
      <button
        disabled={busy}
        className="rounded-lg bg-brand-accent px-3 py-2 text-[13.5px] font-[650] text-white disabled:opacity-60"
      >
        {busy ? '저장 중…' : '저장'}
      </button>
      <div className="w-full">
        {msg && (
          <p className={`mt-1 text-[12.5px] ${msg.ok ? 'text-good' : 'text-crit'}`}>{msg.text}</p>
        )}
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          메일 링크로 가입했다면 비밀번호가 없습니다. 여기서 정해 두면 메일 없이 로그인할 수
          있습니다.
        </p>
      </div>
    </form>
  );
}
