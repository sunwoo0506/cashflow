import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ORG_COOKIE_NAME } from '@/lib/org-types';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  /*
   * 세션만 지우면 「지금 보고 있는 회사」 쿠키가 남는다.
   * 다음 사람이 그 회사에 속해 있지 않으면 무시되지만(getCurrentOrg 가 소속을 확인한다),
   * 남길 이유가 없는 값이다. 로그아웃은 흔적을 남기지 않아야 한다.
   */
  response.cookies.delete(ORG_COOKIE_NAME);
  return response;
}
