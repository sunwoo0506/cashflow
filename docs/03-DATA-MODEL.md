# 03 · 데이터 모델

전체 DDL은 `supabase/migrations/`에 있다 (`자금관리_스키마_v1.sql` + `v2.sql` 기반).
이 문서는 **왜 그렇게 짰는지**만 적는다.

## 설계 원칙 4가지

1. **제출과 사실을 분리한다** — 엑셀 원본은 지우지 않고 쌓는다
2. **사람이 판단한 것만 사람이 적게 한다** — 추측하지 않는다
3. **집계는 저장하지 않는다** — 항상 계산으로 뽑는다
4. **회의에서 본 숫자는 재현 가능해야 한다** — 스냅샷

## 테이블 (19 + 파이프라인 2)

### 테넌시
`organizations` · `memberships(role: owner/manager/staff/viewer)`

`app_org_ids()` / `app_role(org)` 두 함수로 RLS를 건다. 모든 도메인 테이블에 `org_id`.

### 마스터
| 테이블 | 핵심 |
|---|---|
| `entities` | 법인. **`aliases[]`** — 원장마다 「법인B」/「법인B」로 표기가 흔들려서 흡수용 |
| `counterparties` | 거래처. **`is_internal` + `internal_entity_id`** — 그룹 내부 거래 2.24억을 밖에서 받을 돈으로 세지 않기 위해 |
| `beneficiaries` | 수혜 농가 (지원사업) |
| `departments` · `staff_members` | 담당자는 로그인 계정이 없을 수도 있다 |
| `projects` | 지원사업 과제. **`external_system='external'` + `external_id`** ← 외부 시스템 연동 지점 |

### 제출
`report_periods` → `submissions` → `submission_rows(raw jsonb, parsed jsonb)` + `validation_issues`

원본 행을 `raw`에 그대로 남긴다. 파싱 규칙이 바뀌면 여기서 다시 돌린다.
지금 프로토타입은 엑셀을 올리면 기존 데이터가 통째로 덮여서, 누가 언제 뭘 바꿨는지 사라진다.

### 채권
`receivables` — 한 행이 「한 거래처에게 받을 한 건」

두 축을 분리한 것이 핵심:
- **`stage`** (`청구전` / `청구완료`) — 청구했는가. **사람이 고른다**
- **`status`** (`open` / `partial` / `collected` / …) — 얼마나 받았는가. **`receipts` 트리거가 자동 판정**

지원사업은 보조금(발주처 입금)과 자부담(농가 입금)의 **입금 주체가 다르다**.
그래서 `counterparty_id`(입금처)와 `beneficiary_id`(수혜 농가)를 따로 두고, 두 줄로 나눠 적는다.

제약:
- `stage='청구완료'` → `issued_on` 필수
- `kind='지원사업'` → `project_id` 필수 (외부 시스템 연동의 전제)
- `amount_collected <= amount_billed`
- `(org, entity, evidence_type, evidence_no)` 유니크 ← 두 팀이 같은 세금계산서를 각각 올리는 사고 방지

`receipts` — 수금 이력. 트리거가 `amount_collected`와 `status`를 맞춘다.

### 파이프라인
`opportunities` — 수주 전

확률을 두 컬럼으로 나눈다:
- `win_rate_override` — 담당자가 직접 적은 값. **비워 두는 게 정상**
- `win_rate` — 실제 적용값. 트리거가 채운다 (**직접입력 > 단계 기본값 > 0.5**)
- `amount_weighted` — 생성 컬럼 (`amount_expected × win_rate`)

`sales_stage_defaults(org, stage, win_rate)` — 조직을 만들면 표준값 5개가 자동으로 깔린다.
단계를 바꾸면 확률이 따라가되, 직접 적어 둔 건은 유지된다.

**`fn_win_opportunity(id, amount?, due?)`** — 파이프라인 → 채권 승격.
손으로 옮겨 적으면 반드시 어긋나므로 한 번의 호출로 끝낸다. `won_receivable_id`로 서로 연결해
"파이프라인에서 실제로 얼마가 매출이 됐나"를 나중에 볼 수 있게 한다.

### 지출
`fixed_costs` + `fixed_cost_shares` (법인 배분, **합계 100% 제약 트리거**)
`expenses` (일회성, `exec_state` · `approval_state` · **`category`** ← 이름으로 추측하지 않고 받는다)

### 가정 · 스냅샷
`assumption_sets(params jsonb)` · `snapshots(result jsonb, inputs_hash)`

스냅샷이 없으면 "지난주엔 숫자가 달랐는데요"에 답할 수 없다.

## 뷰 · 함수

| 이름 | 용도 |
|---|---|
| `fn_aging(org, as_of)` | 연령분석. **`stage='청구전'` 제외.** 같은 테이블에서 뽑으므로 총액과 어긋날 수 없다 |
| `v_external_receivables` | 그룹 내부 제외한 진짜 받을 돈 |
| `v_cash_inflow` | 4단계 소스를 한 뷰로 (`source` = ar / won / pipe) |
| `fn_pipeline_expected_by_month` | 신규매출 가정에서 뺄 금액 (이중계산 방지) |
| `v_receivable_board` | 청구상태(사람) + 현재상태(자동)를 나란히 |
| `v_receivables_by_product` | 품목별 채권 — 「일반매출 10억」이 뭘로 이뤄졌나 |
| `v_pipeline_accuracy` / `v_stage_calibration` | 확률 기본값을 실적으로 보정하는 근거 |

## 확률 보정 루프

`sales_stage_defaults`의 10/30/50/70/90은 **관례값이지 실적이 아니다.**
`v_stage_calibration`으로 「협상이라고 적은 건 중 실제 몇 %가 수주됐나」를 보고 기본값을 고친다.
**처음 6개월은 이 값을 믿지 말고 데이터를 모으는 기간으로 본다.**

## 남은 확인 사항

- [ ] 지원사업 보조금의 **입금처**가 누구인지 (도? 거래처? 전담기관?) — 18건 전부 비어 있다
- [ ] 회수예정일을 담당자가 직접 적을 수 있는지, 아니면 회전일 추정을 계속 쓸지
- [ ] 「매출 합계」와 「잔액」 중 어느 쪽을 채권의 정의로 삼을지 (현재는 잔액)
