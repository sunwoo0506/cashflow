'use client';

import { createBrowserClient } from '@supabase/ssr';

/** 브라우저에서 쓰는 클라이언트. anon 키만 나가므로 공개돼도 안전하다 (RLS 가 막는다). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
