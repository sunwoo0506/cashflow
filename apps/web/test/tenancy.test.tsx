/**
 * 회사끼리 자료가 안 섞이는지.
 *
 * 실제 차단은 DB 의 RLS 가 한다 — 여기서는 그 앞단, **어느 회사를 고르는가**를 본다.
 * 쿠키에 남은 회사 id 로 남의 회사를 열 수 있으면 RLS 앞에서 이미 새는 것이다.
 *
 * 그리고 화면이 「지금 누구로 · 어느 회사를」 보고 있는지 말해 주는지도 본다.
 * 샘플 데이터는 어느 회사에 넣어도 똑같이 생겨서, 표시가 없으면 새는 것처럼 보인다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getFixtureDataset } from '@/lib/fixture-dataset';
import { StoreProvider } from '@/lib/store';
import { Shell } from '@/components/shell';
import type { Org } from '@/lib/org-types';

let query = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => query,
}));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> };
});

/** `getCurrentOrg` 의 규칙만 떼어 낸 것 — 쿠키가 내 소속일 때만 따른다 */
function pickOrg(mine: Org[], cookie: string | undefined): Org | null {
  if (mine.length === 0) return null;
  return mine.find((o) => o.id === cookie) ?? mine[0]!;
}

const A: Org = { id: 'org-a', name: '가 회사', slug: 'a', role: 'owner' };
const B: Org = { id: 'org-b', name: '나 회사', slug: 'b', role: 'owner' };

describe('회사 고르기 — 쿠키로 남의 회사를 열 수 없다', () => {
  it('내 소속이면 쿠키를 따른다', () => {
    expect(pickOrg([A, B], 'org-b')?.id).toBe('org-b');
  });

  it('내 소속이 아닌 회사 id 가 쿠키에 있으면 무시하고 내 첫 회사로 간다', () => {
    // 앞사람이 쓰던 쿠키가 남아 있는 상황
    expect(pickOrg([B], 'org-a')?.id).toBe('org-b');
  });

  it('어느 회사에도 안 속하면 아무것도 안 준다 — 온보딩으로 보낸다', () => {
    expect(pickOrg([], 'org-a')).toBeNull();
  });
});

describe('헤더가 「누구로 · 어느 회사를」 말해 준다', () => {
  beforeEach(cleanup);

  const renderShell = (org: Org, email: string) =>
    render(
      <StoreProvider data={getFixtureDataset()}>
        <Shell orgs={[org]} org={org} email={email} />
      </StoreProvider>,
    );

  it('로그인한 계정과 회사 이름이 화면에 있다', () => {
    renderShell(A, 'me@example.com');
    expect(screen.getAllByText(/me@example\.com/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/가 회사/).length).toBeGreaterThan(0);
  });

  it('샘플로 넣은 회사에는 「샘플 데이터」 배지가 붙는다', () => {
    renderShell({ ...A, sampleSeededAt: '2026-09-08T00:00:00Z' }, 'me@example.com');
    expect(screen.getAllByText('샘플 데이터').length).toBeGreaterThan(0);
  });

  it('실제 자료를 넣은 회사에는 배지가 없다', () => {
    renderShell({ ...A, sampleSeededAt: null }, 'me@example.com');
    expect(screen.queryByText('샘플 데이터')).toBeNull();
  });
});
