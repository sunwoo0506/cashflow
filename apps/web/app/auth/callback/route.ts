import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * 메일의 로그인 링크가 돌아오는 곳.
 *
 * Supabase 는 메일 템플릿에 따라 두 가지 형태로 돌려보낸다.
 *   - `?code=...`                    PKCE 흐름
 *   - `?token_hash=...&type=email`   기본 메일 템플릿(신형)
 * 하나만 처리하면 다른 형태로 온 링크가 조용히 로그인 화면으로 되돌아간다.
 *
 * 오류는 삼키지 않고 로그인 화면에 이유를 실어 보낸다 —
 * 「Internal Server Error」 만 보이면 무엇이 잘못됐는지 알 수 없다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/';

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  // Supabase 가 먼저 거절한 경우 (링크 만료 등) 그 이유를 그대로 보여준다
  const errDesc = searchParams.get('error_description') ?? searchParams.get('error');

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  if (errDesc) return fail(errDesc);

  try {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail(error.message);
      return NextResponse.redirect(`${origin}${next}`);
    }

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return fail(error.message);
      return NextResponse.redirect(`${origin}${next}`);
    }

    return fail('로그인 링크에 인증 정보가 없습니다. 메일을 다시 받아 주세요.');
  } catch (e) {
    return fail(e instanceof Error ? e.message : '로그인 처리 중 오류가 났습니다');
  }
}
