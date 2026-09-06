import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ORG_COOKIE_NAME, type Entity, type Org, type OrgMember, type Role } from '@/lib/org-types';

export type { Entity, Org, OrgMember, Role } from '@/lib/org-types';
export { ORG_COOKIE_NAME, ROLE_LABEL } from '@/lib/org-types';


/** 내가 속한 회사 전부 */
export async function listMyOrgs(): Promise<Org[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_my_organizations')
    .select('id, name, slug, role')
    .order('created_at');
  if (error) return [];
  return (data ?? []) as Org[];
}

/**
 * 지금 보고 있는 회사.
 * 쿠키에 담긴 회사가 내 소속이면 그걸, 아니면 첫 번째 회사를 쓴다.
 * 한 회사로 고정하지 않는다 — 사용자가 속한 회사에 따라 달라진다.
 */
export async function getCurrentOrg(orgs?: Org[]): Promise<Org | null> {
  const list = orgs ?? (await listMyOrgs());
  if (list.length === 0) return null;
  const picked = (await cookies()).get(ORG_COOKIE_NAME)?.value;
  return list.find((o) => o.id === picked) ?? list[0]!;
}

/** 그 회사의 법인 목록. 없으면 빈 배열 — 전역 컨트롤이 「전체」만 보여준다. */
export async function listEntities(orgId: string): Promise<Entity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('entities')
    .select('id, name, short_name, sort_no')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_no')
    .order('name');
  if (error) return [];
  return (data ?? []).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    shortName: (e.short_name as string | null) ?? null,
    sortNo: (e.sort_no as number) ?? 0,
  }));
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_org_members', { p_org: orgId });
  if (error) return [];
  return (data ?? []).map((m: Record<string, unknown>) => ({
    userId: m.user_id as string,
    email: (m.email as string) ?? '',
    role: m.role as Role,
    createdAt: m.created_at as string,
  }));
}

export async function getUserEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

