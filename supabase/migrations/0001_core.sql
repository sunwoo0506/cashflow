-- ═══════════════════════════════════════════════════════════════════
--  샘플 그룹 자금관리 · 스키마 v1
--  Postgres 15+ / Supabase
--
--  설계 원칙
--   1) 제출(엑셀)과 사실(채권)을 분리한다 — 원본은 지우지 않고 쌓는다
--   2) 사람이 판단한 것은 사람이 적게 한다 — 구분·확실성·성격을 추측하지 않는다
--   3) 집계는 저장하지 않는다 — 연령분석·잔액은 항상 계산으로 뽑는다
--   4) 회의에서 본 숫자는 재현 가능해야 한다 — snapshots
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Supabase 밖에서 테스트할 때를 위한 최소 stub (Supabase에서는 이미 존재)
do $$ begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable
      as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  end if;
end $$;


-- ═══════════════════════ 0. 테넌시 ═══════════════════════

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create type member_role as enum ('owner','manager','staff','viewer');
-- owner   : 전권 (조직 설정, 멤버 관리)
-- manager : 전 법인 조회 + 가정값·시나리오 편집  → 경영진
-- staff   : 담당 부서 데이터 제출·수정만         → 각 팀 담당자
-- viewer  : 조회만                                → 회의 참석자

create table memberships (
  org_id        uuid not null references organizations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          member_role not null default 'staff',
  department_id uuid,                       -- staff 는 소속 부서 데이터만
  created_at    timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on memberships (user_id);

-- 현재 사용자가 속한 조직 (RLS 에서 반복 사용)
create or replace function app_org_ids() returns setof uuid
  language sql stable security definer set search_path = public, auth as $$
  select org_id from memberships where user_id = auth.uid()
$$;

create or replace function app_role(p_org uuid) returns member_role
  language sql stable security definer set search_path = public, auth as $$
  select role from memberships where user_id = auth.uid() and org_id = p_org
$$;


-- ═══════════════════════ 1. 마스터 ═══════════════════════

create table entities (                      -- 법인
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,                 -- '법인A'
  short_name  text,                           -- '샘플'
  -- 원장마다 표기가 흔들린다: '법인B' / '법인B' / '내부법인'
  -- 업로드 시 여기로 흡수해서 한 법인으로 맞춘다
  aliases     text[] not null default '{}',
  biz_no      text,
  sort_no     int not null default 0,
  is_active   boolean not null default true,
  unique (org_id, name)
);

create table departments (                   -- 영업1팀 / 영업2팀 / 지원사업팀 / 경영지원
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  name      text not null,
  code      text,
  unique (org_id, name)
);
alter table memberships
  add constraint memberships_department_fk
  foreign key (department_id) references departments(id) on delete set null;

create table staff_members (                 -- 담당자 (로그인 계정이 없을 수도 있다)
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  department_id uuid references departments(id) on delete set null,
  user_id       uuid references auth.users(id) on delete set null,
  is_active     boolean not null default true,
  unique (org_id, name)
);

create table counterparties (                -- 거래처 = 실제로 돈을 보내는 곳
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  aliases       text[] not null default '{}',
  biz_no        text,
  kind          text,                        -- 거래처 / 지자체 / 법인 / 개인 …
  -- 그룹 내부 거래처 표시. 연결 기준으로 합칠 때 상계되므로
  -- "밖에서 받아야 할 돈"에서 반드시 빼고 봐야 한다
  is_internal        boolean not null default false,
  internal_entity_id uuid references entities(id) on delete set null,
  default_terms_days int,                    -- 기본 회전일
  unique (org_id, name),
  constraint counterparty_internal_needs_entity
    check (not is_internal or internal_entity_id is not null)
);

create table beneficiaries (                 -- 수혜 농가 (지원사업)
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  name     text not null,
  region   text,
  note     text,
  unique (org_id, name)
);

create table projects (                      -- 지원사업 과제 · 외부 시스템 연동 지점
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  entity_id       uuid references entities(id) on delete set null,
  name            text not null,
  code            text,
  agency          text,                      -- 발주처
  start_date      date,
  end_date        date,                      -- 협약 종료일
  settlement_due  date,                      -- 정산금 입금 예정일
  budget_total    numeric(18,2),
  -- 사내 다른 서비스에서 당겨온 과제는 여기로 매핑한다
  external_system text,                      -- 'external'
  external_id     text,
  synced_at       timestamptz,
  unique (org_id, name),
  unique (external_system, external_id)
);


-- ═══════════════════════ 2. 제출 (엑셀 → 시스템) ═══════════════════════

create table report_periods (                -- 보고 기준 회차
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  as_of     date not null,                   -- 기준일 2026-08-13
  label     text,                            -- '8월 3주'
  due_at    timestamptz,                     -- 제출 마감
  status    text not null default 'open' check (status in ('open','closed')),
  unique (org_id, as_of)
);

create type submission_kind   as enum ('수금계획','고정비','일회성지출');
create type submission_status as enum ('draft','submitted','validated','rejected','applied');

create table submissions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  period_id     uuid not null references report_periods(id) on delete cascade,
  kind          submission_kind not null,
  department_id uuid references departments(id) on delete set null,
  submitted_by  uuid references auth.users(id) on delete set null,
  file_path     text,                        -- Storage 원본 경로
  file_name     text,
  file_hash     text,                        -- 같은 파일 재업로드 감지
  row_count     int not null default 0,
  error_count   int not null default 0,
  status        submission_status not null default 'draft',
  note          text,
  submitted_at  timestamptz,
  applied_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index on submissions (org_id, period_id, kind);

-- 엑셀 한 줄을 그대로 남긴다. 파싱 규칙이 바뀌면 여기서 다시 돌린다.
create table submission_rows (
  id            bigserial primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  row_no        int  not null,
  raw           jsonb not null,              -- 원본 셀 그대로
  parsed        jsonb,                       -- 정규화 결과
  is_valid      boolean not null default false,
  target_table  text,
  target_id     uuid,
  unique (submission_id, row_no)
);

create table validation_issues (
  id            bigserial primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  row_no        int,
  column_name   text,
  severity      text not null check (severity in ('error','warning')),
  code          text not null,               -- MISSING_DUE_ON, UNKNOWN_ENTITY, DUP_EVIDENCE_NO …
  message       text not null
);
create index on validation_issues (submission_id, severity);


-- ═══════════════════════ 3. 채권 · 수금 ═══════════════════════

create type receivable_kind   as enum ('일반매출','지원사업','신규매출');
create type funding_source    as enum ('보조금','자부담');
create type certainty_level   as enum ('확정','유력','가정');
create type receivable_status as enum ('open','partial','collected','written_off','cancelled');

create table receivables (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  entity_id        uuid not null references entities(id),
  counterparty_id  uuid not null references counterparties(id),   -- 입금 주체
  -- 지원사업: 보조금은 발주처가, 자부담은 농가가 낸다.
  -- 입금 주체는 counterparty, 수혜 농가는 여기에 따로 남긴다.
  beneficiary_id   uuid references beneficiaries(id),
  project_id       uuid references projects(id),
  funding_source   funding_source,

  kind             receivable_kind not null,
  -- 지금은 거래처명에 '지원사업'이 들어있는지로 추측하고 있다. 사람이 고르게 한다.
  certainty        certainty_level not null default '확정',
  staff_id         uuid references staff_members(id),
  department_id    uuid references departments(id),

  issued_on        date,                     -- 발생일 (세금계산서 발행일)
  amount_billed    numeric(18,2) not null check (amount_billed >= 0),
  amount_collected numeric(18,2) not null default 0 check (amount_collected >= 0),
  amount_open      numeric(18,2) generated always as (amount_billed - amount_collected) stored,
  due_on           date not null,            -- ★ 회수예정일. 추정하지 않고 받는다
  terms_days       int,
  evidence_type    text check (evidence_type in ('세금계산서','정산승인','계약','구두','기타')),
  evidence_no      text,
  status           receivable_status not null default 'open',

  source_submission_id uuid references submissions(id) on delete set null,
  source_row_no        int,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint receivable_collected_le_billed check (amount_collected <= amount_billed),
  -- 지원사업이면 과제를 반드시 붙인다 (외부 시스템 연동의 전제)
  constraint receivable_project_required
    check (kind <> '지원사업' or project_id is not null)
);
create index on receivables (org_id, entity_id, due_on);
create index on receivables (org_id, status, due_on);
create index on receivables (org_id, kind, certainty);
create index on receivables (project_id) where project_id is not null;
-- 같은 세금계산서를 두 팀이 각각 올리는 사고를 막는다
create unique index receivables_evidence_uniq
  on receivables (org_id, entity_id, evidence_type, evidence_no)
  where evidence_no is not null;

create table receipts (                      -- 수금 이력
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  receivable_id uuid not null references receivables(id) on delete cascade,
  received_on   date not null,
  amount        numeric(18,2) not null check (amount > 0),
  method        text,                        -- 계좌이체 / 카드 / 상계 …
  bank_ref      text,                        -- 통장 적요
  source_submission_id uuid references submissions(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on receipts (receivable_id);
create index on receipts (org_id, received_on);

-- 수금이 들어오면 채권 잔액과 상태를 자동으로 맞춘다 (합계를 손으로 적지 않는다)
create or replace function trg_sync_receivable() returns trigger
language plpgsql as $$
declare v_id uuid; v_sum numeric(18,2); v_billed numeric(18,2);
begin
  v_id := coalesce(new.receivable_id, old.receivable_id);
  select coalesce(sum(amount),0) into v_sum from receipts where receivable_id = v_id;
  select amount_billed into v_billed from receivables where id = v_id;
  update receivables set
    amount_collected = v_sum,
    status = case
      when v_sum <= 0        then 'open'::receivable_status
      when v_sum >= v_billed then 'collected'::receivable_status
      else 'partial'::receivable_status end,
    updated_at = now()
  where id = v_id and status not in ('written_off','cancelled');
  return null;
end $$;

create trigger receipts_sync
  after insert or update or delete on receipts
  for each row execute function trg_sync_receivable();


-- ═══════════════════════ 4. 지출 ═══════════════════════

create table fixed_costs (                   -- 매월 반복
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  item           text not null,
  account_code   text,                       -- 계정과목
  monthly_amount numeric(18,2) not null check (monthly_amount >= 0),
  pay_day        int not null check (pay_day between 1 and 31),
  effective_from date not null,
  effective_to   date,
  source_submission_id uuid references submissions(id) on delete set null,
  note           text,
  constraint fixed_cost_period check (effective_to is null or effective_to >= effective_from)
);

create table fixed_cost_shares (             -- 법인 배분 (급여 45:55 등)
  fixed_cost_id uuid not null references fixed_costs(id) on delete cascade,
  entity_id     uuid not null references entities(id) on delete cascade,
  share         numeric(6,4) not null check (share >= 0 and share <= 1),
  primary key (fixed_cost_id, entity_id)
);

-- 배분 합이 100%가 아니면 저장을 막는다 (지금은 share 하나로 나머지를 추론한다)
create or replace function trg_check_share() returns trigger
language plpgsql as $$
declare v_id uuid; v_sum numeric;
begin
  v_id := coalesce(new.fixed_cost_id, old.fixed_cost_id);
  select coalesce(sum(share),0) into v_sum from fixed_cost_shares where fixed_cost_id = v_id;
  if v_sum > 0 and abs(v_sum - 1) > 0.0001 then
    raise exception '법인 배분 합계가 100%% 가 아닙니다 (현재 %)', round(v_sum*100,2) || '%';
  end if;
  return null;
end $$;

create constraint trigger fixed_cost_shares_sum
  after insert or update or delete on fixed_cost_shares
  deferrable initially deferred
  for each row execute function trg_check_share();

create type exec_state     as enum ('집행','연기','취소');
create type approval_state as enum ('미신청','신청','보정중','승인');

create table expenses (                      -- 일회성 지출
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  entity_id      uuid not null references entities(id),
  item           text not null,
  account_code   text,
  -- 지금은 항목 이름으로 자동 분류한다(매입·자재 / 회생 관련 / 인건비 …).
  -- 작성자가 고르게 해서 분류를 사실로 만든다.
  category       text,
  planned_on     date not null,
  amount         numeric(18,2) not null check (amount >= 0),
  exec_state     exec_state not null default '집행',
  deferred_to    date,
  approval_state approval_state not null default '미신청',
  project_id     uuid references projects(id) on delete set null,
  source_submission_id uuid references submissions(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint expense_defer_needs_date check (exec_state <> '연기' or deferred_to is not null)
);
create index on expenses (org_id, entity_id, planned_on);
create index on expenses (org_id, exec_state);


-- ═══════════════════════ 5. 가정값 · 시나리오 · 스냅샷 ═══════════════════════

create table assumption_sets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  period_id      uuid references report_periods(id) on delete cascade,
  name           text not null default '기본',
  start_date     date not null,
  weeks          int  not null default 22 check (weeks between 1 and 104),
  opening_cash   numeric(18,2) not null,
  warn_line      numeric(18,2) not null,     -- 안전선
  -- 신규매출 계획, 회수 지연 주수, 과제 집행률, 잔여채권 월별 배분 등
  params         jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (org_id, period_id, name)
);

-- 회의에서 본 화면을 그대로 다시 띄우기 위한 고정본.
-- 이게 없으면 "지난주엔 숫자가 달랐는데요"에 답할 수 없다.
create table snapshots (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  period_id         uuid not null references report_periods(id) on delete cascade,
  assumption_set_id uuid references assumption_sets(id) on delete set null,
  label             text not null,           -- '8/13 경영회의'
  achievement_rate  numeric(6,4) not null check (achievement_rate between 0 and 2),
  entity_id         uuid references entities(id),   -- null = 전체 통합
  result            jsonb not null,          -- 계산 엔진 출력 전체 (주차별·월별)
  inputs_hash       text,                    -- 입력이 그대로인지 대조용
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index on snapshots (org_id, period_id, created_at desc);


-- ═══════════════════════ 6. 집계 — 저장하지 않고 계산한다 ═══════════════════════

-- 연령분석. 지금은 별도 원장에서 와서 매출채권 총액과 1.85억이 어긋난다.
-- 같은 테이블에서 뽑으면 어긋날 수가 없다.
create or replace function fn_aging(p_org uuid, p_as_of date default current_date)
returns table (
  entity_id uuid, entity_name text, kind receivable_kind,
  bucket text, bucket_no int, amount numeric
)
language sql stable as $$
  select e.id, e.name, r.kind,
    b.label, b.no,
    sum(r.amount_open)
  from receivables r
  join entities e on e.id = r.entity_id
  cross join lateral (
    select * from (values
      (case when r.due_on >= p_as_of                     then 1
            when p_as_of - r.due_on <= 30                then 2
            when p_as_of - r.due_on <= 60                then 3
            when p_as_of - r.due_on <= 90                then 4
            else 5 end)
    ) v(no)
  ) n
  cross join lateral (
    select n.no as no,
      (array['정상','30일','60일','90일','90일초과'])[n.no] as label
  ) b
  where r.org_id = p_org
    and r.status in ('open','partial')
  group by e.id, e.name, r.kind, b.label, b.no
$$;

-- 밖에서 실제로 받아야 할 돈 (그룹 내부 채권 제외)
create or replace view v_external_receivables as
  select r.*, c.name as counterparty_name, c.is_internal
  from receivables r
  join counterparties c on c.id = r.counterparty_id
  where r.status in ('open','partial')
    and c.is_internal = false;

-- 주차별 수금 계획 (계산 엔진 입력)
create or replace function fn_inflow_plan(p_org uuid, p_from date, p_to date)
returns table (
  week_start date, entity_id uuid, kind receivable_kind,
  certainty certainty_level, amount numeric, item_count bigint
)
language sql stable as $$
  select date_trunc('week', greatest(r.due_on, p_from))::date,
         r.entity_id, r.kind, r.certainty,
         sum(r.amount_open), count(*)
  from receivables r
  where r.org_id = p_org
    and r.status in ('open','partial')
    and r.due_on <= p_to
  group by 1,2,3,4
$$;


-- ═══════════════════════ 7. RLS ═══════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','memberships','entities','departments','staff_members',
    'counterparties','beneficiaries','projects','report_periods','submissions',
    'validation_issues','receivables','receipts','fixed_costs','fixed_cost_shares',
    'expenses','assumption_sets','snapshots'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- org_id 를 직접 가진 테이블: 소속 조직만 보인다
do $$
declare t text;
begin
  foreach t in array array[
    'entities','departments','staff_members','counterparties','beneficiaries',
    'projects','report_periods','submissions','receivables','receipts',
    'fixed_costs','expenses','assumption_sets','snapshots'
  ] loop
    execute format($p$
      create policy %1$I_read on %1$I for select
        using (org_id in (select app_org_ids()));
      create policy %1$I_write on %1$I for all
        using (org_id in (select app_org_ids())
               and app_role(org_id) in ('owner','manager','staff'))
        with check (org_id in (select app_org_ids())
               and app_role(org_id) in ('owner','manager','staff'));
    $p$, t);
  end loop;
end $$;

create policy organizations_read on organizations for select
  using (id in (select app_org_ids()));
create policy memberships_read on memberships for select
  using (org_id in (select app_org_ids()));

-- 자식 테이블은 부모를 통해 판정
create policy fixed_cost_shares_all on fixed_cost_shares for all
  using (exists (select 1 from fixed_costs f
                 where f.id = fixed_cost_id and f.org_id in (select app_org_ids())));
create policy validation_issues_read on validation_issues for select
  using (exists (select 1 from submissions s
                 where s.id = submission_id and s.org_id in (select app_org_ids())));

alter table submission_rows enable row level security;
create policy submission_rows_read on submission_rows for select
  using (exists (select 1 from submissions s
                 where s.id = submission_id and s.org_id in (select app_org_ids())));


-- ═══════════════════════ 8. updated_at ═══════════════════════

create or replace function trg_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger receivables_touch before update on receivables
  for each row execute function trg_touch();
create trigger expenses_touch before update on expenses
  for each row execute function trg_touch();
