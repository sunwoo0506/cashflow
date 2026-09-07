-- 0006 · 「이 회사 자료는 샘플이다」 표시
--
-- 샘플 데이터는 어느 회사에 넣든 똑같이 생겼다 — 법인명도 금액도 건수도 같다.
-- 그래서 다른 계정으로 로그인해도 화면이 똑같이 보이고, **자료가 새는 것처럼 보인다.**
-- 실제로는 회사마다 별개의 행이지만(org_id 가 다르다), 보는 사람은 그걸 알 수 없다.
--
-- 화면이 「이건 샘플입니다」라고 말할 수 있도록 표시를 남긴다.

alter table organizations
  add column if not exists sample_seeded_at timestamptz;

comment on column organizations.sample_seeded_at is
  '샘플 데이터를 넣은 시각. null 이면 실제 자료. 화면에 「샘플」 배지를 띄우는 근거.';

-- 뷰가 이 값을 같이 넘겨야 헤더에서 쓸 수 있다.
-- create or replace 는 **뒤에만** 열을 붙일 수 있다 — 중간에 끼우면 42P16 이 난다.
create or replace view v_my_organizations as
  select o.id, o.name, o.slug, o.created_at, m.role, m.user_id, o.sample_seeded_at
  from organizations o
  join memberships m on m.org_id = o.id
  where m.user_id = auth.uid();

grant select on v_my_organizations to authenticated;

-- 샘플 표시는 그 회사 owner·manager 만 바꿀 수 있다.
-- organizations_update 정책이 owner 만 허용하므로, 시딩(담당자도 가능)을 위해 함수로 연다.
create or replace function fn_mark_sample(p_org uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if app_role(p_org) not in ('owner', 'manager', 'staff') then
    raise exception '이 회사를 바꿀 권한이 없습니다' using errcode = '42501';
  end if;
  update organizations
     set sample_seeded_at = case when p_on then now() else null end
   where id = p_org;
end $$;

revoke all on function fn_mark_sample(uuid, boolean) from public;
grant execute on function fn_mark_sample(uuid, boolean) to authenticated;
