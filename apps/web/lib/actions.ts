'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ORG_COOKIE_NAME } from '@/lib/org-types';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/** 회사 만들기 — 만든 사람이 owner 가 된다 */
export async function createOrganization(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, message: '회사 이름을 입력해 주세요' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_create_organization', { p_name: name });
  if (error) return { ok: false, message: error.message };

  const org = Array.isArray(data) ? data[0] : data;
  if (org?.id) (await cookies()).set(ORG_COOKIE_NAME, org.id, { path: '/', maxAge: 60 * 60 * 24 * 365 });

  revalidatePath('/', 'layout');
  redirect('/settings?created=1');
}

/** 보고 있는 회사 바꾸기 */
export async function switchOrganization(orgId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE_NAME, orgId, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}

export async function renameOrganization(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('orgId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!id || !name) return { ok: false, message: '회사 이름을 입력해 주세요' };

  const supabase = await createClient();
  const { error } = await supabase.from('organizations').update({ name }).eq('id', id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: '회사 이름을 바꿨습니다' };
}

/** 법인 추가 */
export async function addEntity(formData: FormData): Promise<ActionResult> {
  const orgId = String(formData.get('orgId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const shortName = String(formData.get('shortName') ?? '').trim();
  if (!orgId || !name) return { ok: false, message: '법인 이름을 입력해 주세요' };

  const supabase = await createClient();
  const { error } = await supabase.from('entities').insert({
    org_id: orgId,
    name,
    short_name: shortName || null,
  });
  if (error) {
    return {
      ok: false,
      message: error.code === '23505' ? '이미 있는 법인 이름입니다' : error.message,
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: `${name} 을(를) 추가했습니다` };
}

export async function removeEntity(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('entityId') ?? '');
  if (!id) return { ok: false, message: '법인을 찾을 수 없습니다' };

  const supabase = await createClient();
  // 실제로 지우지 않고 비활성으로 둔다 — 과거 데이터가 법인을 참조한다
  const { error } = await supabase.from('entities').update({ is_active: false }).eq('id', id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: '법인을 목록에서 내렸습니다' };
}

/** 멤버 추가 — 상대가 먼저 가입해 있어야 한다 */
export async function addMember(formData: FormData): Promise<ActionResult> {
  const orgId = String(formData.get('orgId') ?? '');
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? 'staff');
  if (!orgId || !email) return { ok: false, message: '이메일을 입력해 주세요' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_add_member', {
    p_org: orgId,
    p_email: email,
    p_role: role,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/settings');
  return { ok: true, message: `${email} 을(를) 추가했습니다` };
}

export async function removeMember(formData: FormData): Promise<ActionResult> {
  const orgId = String(formData.get('orgId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const supabase = await createClient();
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/settings');
  return { ok: true, message: '멤버를 내보냈습니다' };
}
