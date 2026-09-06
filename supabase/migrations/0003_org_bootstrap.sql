-- 0003 · 회사 만들기 · 멤버 관리
--
-- 0001 은 「이미 회사에 속한 사람」만 다룬다. organizations 에 INSERT 정책이 없어서
-- 가입한 사람이 첫 회사를 만들 길이 없었다. 그 입구를 연다.
--
-- 정책으로 열지 않고 security definer 함수로 여는 이유:
-- 회사 생성은 organizations INSERT 와 memberships INSERT 가 한 트랜잭션에서 같이 일어나야 한다.
-- 정책만 열면 그 사이에 실패했을 때 주인 없는 회사가 남는다.

-- ── 슬러그 만들기 ────────────────────────────────────────────────
-- 한글 이름은 라틴 문자로 못 바꾸므로, 남는 게 없으면 임의 문자열을 쓴다.
create or replace function fn_slugify(p_text text) returns text
language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'org'
  );
$$;

-- ── 회사 만들기 ──────────────────────────────────────────────────
-- 만든 사람이 owner 가 된다. organizations_seed 트리거가 영업단계 표준 확률을 깔아 준다.
create or replace function fn_create_organization(
  p_name text,
  p_slug text default null
) returns organizations
language plpgsql security definer set search_path = public, auth as $$
declare
  v_org  organizations;
  v_base text;
  v_slug text;
  v_n    int := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception '회사 이름을 입력해 주세요' using errcode = '22023';
  end if;

  v_base := fn_slugify(coalesce(nullif(trim(p_slug), ''), p_name));
  v_slug := v_base;
  -- 슬러그가 겹치면 뒤에 번호를 붙인다
  while exists (select 1 from organizations o where o.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
    if v_n > 50 then
      v_slug := v_base || '-' || substr(md5(random()::text), 1, 6);
      exit;
    end if;
  end loop;

  insert into organizations (name, slug) values (trim(p_name), v_slug)
  returning * into v_org;

  insert into memberships (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  return v_org;
end $$;

revoke all on function fn_create_organization(text, text) from public;
grant execute on function fn_create_organization(text, text) to authenticated;

-- ── 멤버 관리 ────────────────────────────────────────────────────
-- owner·manager 만 멤버를 넣고 뺄 수 있다.
create policy memberships_write on memberships for all
  using (app_role(org_id) in ('owner', 'manager'))
  with check (app_role(org_id) in ('owner', 'manager'));

-- 회사 이름 바꾸기는 owner 만
create policy organizations_update on organizations for update
  using (app_role(id) = 'owner')
  with check (app_role(id) = 'owner');

-- ── 이메일로 멤버 추가 ───────────────────────────────────────────
-- 초대 메일 발송은 아직 없다. 상대가 먼저 가입해 있어야 한다.
create or replace function fn_add_member(
  p_org   uuid,
  p_email text,
  p_role  member_role default 'staff'
) returns memberships
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid;
  v_row  memberships;
begin
  if app_role(p_org) not in ('owner', 'manager') then
    raise exception '멤버를 추가할 권한이 없습니다' using errcode = '42501';
  end if;

  select id into v_user from auth.users
  where lower(email) = lower(trim(p_email)) limit 1;

  if v_user is null then
    raise exception '% 로 가입한 사용자가 없습니다. 먼저 가입하도록 안내해 주세요', p_email
      using errcode = 'P0002';
  end if;

  insert into memberships (org_id, user_id, role)
  values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role
  returning * into v_row;

  return v_row;
end $$;

revoke all on function fn_add_member(uuid, text, member_role) from public;
grant execute on function fn_add_member(uuid, text, member_role) to authenticated;

-- ── 내 회사 목록 ─────────────────────────────────────────────────
-- memberships 와 organizations 를 한 번에. 역할까지 같이 준다.
create or replace view v_my_organizations as
  select o.id, o.name, o.slug, o.created_at, m.role, m.user_id
  from organizations o
  join memberships m on m.org_id = o.id
  where m.user_id = auth.uid();

grant select on v_my_organizations to authenticated;

-- ── 멤버 목록에 이메일을 붙여 보여주기 ───────────────────────────
-- auth.users 는 클라이언트가 직접 못 읽는다. 같은 회사 사람만 보이게 감싼다.
create or replace function fn_org_members(p_org uuid)
returns table (user_id uuid, email text, role member_role, created_at timestamptz)
language sql security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
    and p_org in (select app_org_ids())
  order by m.created_at;
$$;

revoke all on function fn_org_members(uuid) from public;
grant execute on function fn_org_members(uuid) to authenticated;
