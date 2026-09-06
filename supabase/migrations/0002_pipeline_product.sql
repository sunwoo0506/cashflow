-- ═══════════════════════════════════════════════════════════════════
--  샘플 그룹 자금관리 · 스키마 v2 추가분  (rev.4 — 확률 자동 적용 · 청구상태 단순화 · 품목)
--  v1(자금관리_스키마_v1.sql) 을 먼저 적용한 뒤 이 파일을 올립니다.
--
--  더하는 것 : 수주 전 영업 파이프라인 · 승격 추적 · 단계별 확률 자동 적용
--  고치는 것 : 채권에 「단계」를 넣어, 세금계산서 전이라도 현금흐름에 잡히게 함
--             일반매출에 품목을 붙여, 거래처 이름만으로는 알 수 없던 건을 식별
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════ 1. 채권에 단계를 넣는다 ═══════════
-- 지금까지는 "세금계산서를 끊었는가"가 채권의 시작이었다.
-- 계약은 됐는데 청구 전인 돈이 통째로 안 보이던 이유다.

-- 사람이 고르는 값은 둘뿐이다. 부분수금·수금완료는 받은 금액에서 자동으로 나오므로
-- 여기에 넣지 않는다 (그건 이미 v1 의 status 컬럼이 트리거로 관리한다).
--   stage  = 청구했는가          → 사람이 고름
--   status = 얼마나 받았는가     → receipts 트리거가 자동 판정
create type ar_stage as enum ('청구전','청구완료');

alter table receivables
  add column stage ar_stage not null default '청구완료';

-- 청구했다면 발생일(세금계산서 발행일)이 반드시 있어야 한다
alter table receivables
  add constraint receivable_stage_evidence
  check (stage = '청구전' or issued_on is not null);

comment on column receivables.stage is
  '청구전 = 계약O 세금계산서X (전액 현금흐름 반영, 연령분석 제외) / 청구완료 = 세금계산서O';

-- 연령분석은 청구된 건만 대상으로 한다. 청구 전 건에 "연체"는 의미가 없다.
create or replace function fn_aging(p_org uuid, p_as_of date default current_date)
returns table (
  entity_id uuid, entity_name text, kind receivable_kind,
  bucket text, bucket_no int, amount numeric
)
language sql stable as $$
  select e.id, e.name, r.kind, b.label, b.no, sum(r.amount_open)
  from receivables r
  join entities e on e.id = r.entity_id
  cross join lateral (select
      (case when r.due_on >= p_as_of      then 1
            when p_as_of - r.due_on <= 30 then 2
            when p_as_of - r.due_on <= 60 then 3
            when p_as_of - r.due_on <= 90 then 4
            else 5 end) as no) n
  cross join lateral (select n.no as no,
      (array['정상','30일','60일','90일','90일초과'])[n.no] as label) b
  where r.org_id = p_org
    and r.status in ('open','partial')
    and r.stage <> '청구전'            -- ★ 청구 전 건은 연령분석에서 뺀다
  group by e.id, e.name, r.kind, b.label, b.no
$$;


-- ═══════════ 1-b. 품목 ═══════════
-- 지원사업은 수혜농가·과제명으로 무슨 건인지 알 수 있는데, 일반매출은 거래처 이름뿐이라
-- 「거래처001 4,600원」이 무슨 거래인지 알 방법이 없었다.
-- 구분(일반매출/지원사업)은 '무엇을 파는가'의 큰 갈래이고, 품목은 그 안의 실제 물건이다.

create type product_category as enum ('농자재','농산물','식품','보건용품','기타');
-- 회계장부 「매출장」의 품목 구분과 같은 기준.
-- '농산물' 은 계산서·면세분 (예전 원장의 '감귤유통').

alter table receivables
  add column product_category product_category,
  add column product_name     text;             -- 대표 품목명 (예: 관수용 PE배관)

create index on receivables (org_id, product_category)
  where product_category is not null;

comment on column receivables.product_name is
  '대표 품목명. 한 건에 여러 품목이면 금액이 가장 큰 것 하나만 적는다.';


-- ═══════════ 2. 영업 파이프라인 ═══════════

create type sales_stage as enum ('발굴','상담','견적','협상','수주확정','실주','보류');

create table opportunities (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  entity_id       uuid not null references entities(id),
  counterparty_id uuid references counterparties(id),
  -- 신규 거래처는 마스터에 아직 없을 수 있다. 이름만 받아 두고 나중에 붙인다.
  counterparty_name text,
  project_id      uuid references projects(id) on delete set null,

  kind            receivable_kind not null,
  stage           sales_stage not null default '발굴',
  title           text not null,                  -- 건명
  channel         text,                           -- 직판 / 거래처 / 중앙회 / 대리점 …
  product_category product_category,
  product_name     text,

  amount_expected numeric(18,2) not null check (amount_expected >= 0),

  -- 확률 = 이 건이 실제로 계약될 가능성.
  --   win_rate_override : 담당자가 직접 적은 값. 비워 두는 것이 정상이다.
  --   win_rate          : 실제로 계산에 쓰이는 값. 트리거가 채운다.
  --                       직접입력 > 영업단계 기본값 > 0.5 순으로 정해진다.
  win_rate_override numeric(4,3) check (win_rate_override between 0 and 1),
  win_rate          numeric(4,3) not null default 0.5 check (win_rate between 0 and 1),
  amount_weighted   numeric(18,2)
                    generated always as (amount_expected * win_rate) stored,

  expected_close_on date,                         -- 수주 예정일
  expected_due_on   date not null,                -- 예상 입금일 ★ 현금흐름에 쓰는 날짜
  staff_id        uuid references staff_members(id),
  department_id   uuid references departments(id),

  next_action     text,
  action_due_on   date,

  -- ★ 승격 추적: 수주되면 receivables 로 옮기고 여기에 연결한다.
  --   이게 있어야 "파이프라인에서 실제로 얼마가 매출이 됐나"를 나중에 볼 수 있다.
  won_receivable_id uuid references receivables(id) on delete set null,
  closed_at       timestamptz,
  lost_reason     text,

  source_submission_id uuid references submissions(id) on delete set null,
  source_row_no   int,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint opp_needs_counterparty
    check (counterparty_id is not null or counterparty_name is not null),
  constraint opp_won_needs_link
    check (stage <> '수주확정' or won_receivable_id is not null or closed_at is null)
);
create index on opportunities (org_id, entity_id, expected_due_on);
create index on opportunities (org_id, stage);
create index on opportunities (won_receivable_id) where won_receivable_id is not null;

create trigger opportunities_touch before update on opportunities
  for each row execute function trg_touch();

alter table opportunities enable row level security;
create policy opportunities_read on opportunities for select
  using (org_id in (select app_org_ids()));
create policy opportunities_write on opportunities for all
  using (org_id in (select app_org_ids())
         and app_role(org_id) in ('owner','manager','staff'))
  with check (org_id in (select app_org_ids())
         and app_role(org_id) in ('owner','manager','staff'));

-- ═══════════ 2-b. 영업단계별 기본 확률 ═══════════
-- 담당자가 단계만 고르면 확률이 자동으로 붙는다.
-- 조직마다 실적이 다르므로 값은 조직별로 둔다 (v_pipeline_accuracy 로 나중에 보정).

create table sales_stage_defaults (
  org_id   uuid not null references organizations(id) on delete cascade,
  stage    sales_stage not null,
  win_rate numeric(4,3) not null check (win_rate between 0 and 1),
  primary key (org_id, stage)
);
alter table sales_stage_defaults enable row level security;
create policy ssd_read on sales_stage_defaults for select
  using (org_id in (select app_org_ids()));
create policy ssd_write on sales_stage_defaults for all
  using (org_id in (select app_org_ids()) and app_role(org_id) in ('owner','manager'))
  with check (org_id in (select app_org_ids()) and app_role(org_id) in ('owner','manager'));

-- 새 조직이 생기면 표준값을 깔아 준다
create or replace function fn_seed_stage_defaults(p_org uuid) returns void
language sql as $$
  insert into sales_stage_defaults (org_id, stage, win_rate) values
    (p_org, '발굴',     0.10),
    (p_org, '상담',     0.30),
    (p_org, '견적',     0.50),
    (p_org, '협상',     0.70),
    (p_org, '수주확정', 0.90)
  on conflict (org_id, stage) do nothing;
$$;

create or replace function trg_seed_org() returns trigger
language plpgsql as $$ begin perform fn_seed_stage_defaults(new.id); return null; end $$;

create trigger organizations_seed after insert on organizations
  for each row execute function trg_seed_org();

-- 확률 자동 적용 : 직접입력 > 단계 기본값 > 0.5
create or replace function trg_apply_win_rate() returns trigger
language plpgsql as $$
declare v numeric(4,3);
begin
  if new.win_rate_override is not null then
    new.win_rate := new.win_rate_override;
  else
    select d.win_rate into v
      from sales_stage_defaults d
     where d.org_id = new.org_id and d.stage = new.stage;
    new.win_rate := coalesce(v, 0.5);
  end if;
  return new;
end $$;

-- 단계를 바꾸면 확률도 따라 바뀐다 (직접 적어 둔 건은 그대로 유지)
create trigger opportunities_win_rate
  before insert or update of stage, win_rate_override on opportunities
  for each row execute function trg_apply_win_rate();


-- ═══════════ 3. 승격 : 파이프라인 → 채권 ═══════════
-- 손으로 옮겨 적으면 반드시 어긋난다. 한 번의 호출로 끝낸다.

create or replace function fn_win_opportunity(
  p_opportunity_id uuid,
  p_amount         numeric default null,   -- 실제 계약금액 (없으면 예상금액)
  p_due_on         date    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare o opportunities; v_cp uuid; v_id uuid;
begin
  select * into o from opportunities where id = p_opportunity_id;
  if not found then raise exception '해당 영업 건이 없습니다: %', p_opportunity_id; end if;
  if o.won_receivable_id is not null then
    raise exception '이미 매출로 넘어간 건입니다 (채권 %)', o.won_receivable_id;
  end if;

  -- 거래처가 마스터에 없으면 이름으로 만들어 붙인다
  v_cp := o.counterparty_id;
  if v_cp is null then
    insert into counterparties (org_id, name) values (o.org_id, o.counterparty_name)
    on conflict (org_id, name) do update set name = excluded.name
    returning id into v_cp;
  end if;

  insert into receivables (
    org_id, entity_id, counterparty_id, project_id, kind, stage,
    product_category, product_name,
    certainty, staff_id, department_id,
    amount_billed, due_on, status, note
  ) values (
    o.org_id, o.entity_id, v_cp, o.project_id, o.kind, '청구전',
    o.product_category, o.product_name,
    '확정', o.staff_id, o.department_id,
    coalesce(p_amount, o.amount_expected),
    coalesce(p_due_on, o.expected_due_on), 'open',
    '영업 파이프라인에서 승격 · ' || o.title
  ) returning id into v_id;

  update opportunities
     set stage = '수주확정', won_receivable_id = v_id, closed_at = now()
   where id = p_opportunity_id;

  return v_id;
end $$;


-- ═══════════ 4. 현금흐름 입력 — 4단계를 한 뷰로 ═══════════
-- 대시보드의 토글이 이 뷰의 source 를 켜고 끈다.

create or replace view v_cash_inflow as
  -- ① 확정 채권 (청구완료 · 부분수금)
  select 'ar'::text        as source,
         r.org_id, r.entity_id, r.kind::text, r.due_on,
         r.amount_open     as amount,
         c.name            as counterparty,
         r.product_category::text as product,
         null::text        as title,
         1.0::numeric      as weight
    from receivables r
    join counterparties c on c.id = r.counterparty_id
   where r.status in ('open','partial') and r.stage <> '청구전'
  union all
  -- ② 수주 확정 · 청구 전 — 전액
  select 'won',
         r.org_id, r.entity_id, r.kind::text, r.due_on,
         r.amount_open, c.name, r.product_category::text, r.note, 1.0
    from receivables r
    join counterparties c on c.id = r.counterparty_id
   where r.status in ('open','partial') and r.stage = '청구전'
  union all
  -- ③ 영업 파이프라인 — 확률 가중
  select 'pipe',
         o.org_id, o.entity_id, o.kind::text, o.expected_due_on,
         o.amount_weighted,
         coalesce(c.name, o.counterparty_name), o.product_category::text, o.title, o.win_rate
    from opportunities o
    left join counterparties c on c.id = o.counterparty_id
   where o.stage not in ('수주확정','실주','보류')
     and o.won_receivable_id is null;
-- ④ 신규매출 가정은 assumption_sets.params 에서 나오므로 테이블이 없다.

-- 월별 파이프라인 기대값. 신규매출 가정에서 이 금액을 빼야 이중계산이 안 난다.
create or replace function fn_pipeline_expected_by_month(p_org uuid, p_from date, p_to date)
returns table (month date, entity_id uuid, amount numeric)
language sql stable as $$
  select date_trunc('month', o.expected_due_on)::date, o.entity_id, sum(o.amount_weighted)
  from opportunities o
  where o.org_id = p_org
    and o.stage not in ('수주확정','실주','보류')
    and o.won_receivable_id is null
    and o.expected_due_on between p_from and p_to
  group by 1, 2
$$;

-- 파이프라인이 실제로 얼마나 매출이 됐나 — 단계별 기본 확률을 보정하는 근거
create or replace view v_pipeline_accuracy as
  select o.org_id, o.department_id, o.stage,
         count(*)                                     as 건수,
         round(avg(o.win_rate) * 100, 1)              as 평균확률,
         sum(o.amount_expected)                       as 예상합계,
         sum(r.amount_billed)                         as 실제합계,
         case when sum(o.amount_expected) > 0
              then round(sum(r.amount_billed) / sum(o.amount_expected) * 100, 1)
         end                                          as 실현율
    from opportunities o
    join receivables r on r.id = o.won_receivable_id
   group by o.org_id, o.department_id, o.stage;


-- ═══════════ 5. 제출 종류에 파이프라인 추가 ═══════════
alter type submission_kind add value if not exists '영업파이프라인';


-- 단계별 기본 확률을 실적으로 보정할 때 쓰는 표.
-- 「협상은 70%로 잡고 있는데 실제로는 55%더라」가 여기서 나온다.
create or replace view v_stage_calibration as
  select d.org_id, d.stage,
         round(d.win_rate * 100, 1)                     as 현재_기본확률,
         count(o.id)                                    as 마감건수,
         count(o.won_receivable_id)                     as 수주건수,
         case when count(o.id) > 0
              then round(count(o.won_receivable_id)::numeric / count(o.id) * 100, 1)
         end                                            as 실제_수주율
    from sales_stage_defaults d
    left join opportunities o
      on o.org_id = d.org_id and o.stage = d.stage and o.closed_at is not null
   group by d.org_id, d.stage, d.win_rate;


-- 사람이 고르는 값(청구상태)과 자동으로 나오는 값(수금상태)을 나눠 보여 준다.
-- 담당자는 stage 만 고르면 되고, status 는 receipts 트리거가 알아서 맞춘다.
create or replace view v_receivable_board as
  select r.id, r.org_id, e.name as 법인, c.name as 거래처, r.kind as 구분,
         r.stage                                   as 청구상태,
         case r.stage
           when '청구전' then '청구 전'
           else case
             when r.amount_collected <= 0            then '미수금'
             when r.amount_collected >= r.amount_billed then '수금완료'
             else '일부 수금' end
         end                                       as 현재상태,
         r.amount_billed as 청구금액, r.amount_collected as 받은금액,
         r.amount_open   as 잔액,     r.due_on           as 회수예정일
    from receivables r
    join entities e on e.id = r.entity_id
    join counterparties c on c.id = r.counterparty_id
   where r.status not in ('written_off','cancelled');


-- 품목별 채권 — 「일반매출 10억」이 무엇으로 이뤄져 있는지 본다.
create or replace view v_receivables_by_product as
  select r.org_id, e.name as 법인, r.kind as 구분,
         coalesce(r.product_category::text, '미분류') as 품목,
         count(*)                       as 건수,
         sum(r.amount_open)             as 잔액,
         sum(r.amount_open) filter (where r.due_on < current_date) as 연체잔액
    from receivables r
    join entities e on e.id = r.entity_id
   where r.status in ('open','partial')
   group by r.org_id, e.name, r.kind, coalesce(r.product_category::text, '미분류');

-- 품목별 파이프라인 — 어느 품목에서 새 매출이 나오고 있나
create or replace view v_pipeline_by_product as
  select o.org_id, e.name as 법인,
         coalesce(o.product_category::text, '미분류') as 품목,
         count(*)                  as 건수,
         sum(o.amount_expected)    as 예상금액,
         sum(o.amount_weighted)    as 확률가중
    from opportunities o
    join entities e on e.id = o.entity_id
   where o.stage not in ('수주확정','실주','보류') and o.won_receivable_id is null
   group by o.org_id, e.name, coalesce(o.product_category::text, '미분류');
