-- 0005 · 고정비도 달마다 집행 여부를 기록한다
--
-- fixed_costs 는 「매달 얼마가 나간다」는 계획이다. 그런데 그 달에 미루거나 건너뛰는 일이 있다.
-- 계획은 그대로 두고, 달마다의 실제 처리를 따로 적는다.
--
-- 되돌리려면 : drop table fixed_cost_runs;

create table fixed_cost_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  fixed_cost_id  uuid not null references fixed_costs(id) on delete cascade,
  -- 그 달의 1일. 달 단위로만 기록한다 (지급일은 fixed_costs.pay_day 가 정한다)
  month_start    date not null,
  exec_state     exec_state not null default '집행',
  -- '연기' 일 때 옮겨 갈 날짜
  deferred_to    date,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (fixed_cost_id, month_start),
  constraint fcr_defer_needs_date check (exec_state <> '연기' or deferred_to is not null),
  constraint fcr_month_is_first check (extract(day from month_start) = 1)
);

create index on fixed_cost_runs (org_id, month_start);

alter table fixed_cost_runs enable row level security;

create policy fixed_cost_runs_read on fixed_cost_runs for select
  using (org_id in (select app_org_ids()));
create policy fixed_cost_runs_write on fixed_cost_runs for all
  using (org_id in (select app_org_ids()) and app_role(org_id) in ('owner','manager','staff'))
  with check (org_id in (select app_org_ids()) and app_role(org_id) in ('owner','manager','staff'));

create trigger fixed_cost_runs_touch before update on fixed_cost_runs
  for each row execute function trg_touch();

comment on table fixed_cost_runs is
  '고정비의 달별 집행 기록. 행이 없으면 「집행」으로 본다 — 평소에는 아무것도 안 적어도 된다.';
