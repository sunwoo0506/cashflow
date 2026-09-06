/**
 * 업로드 파일의 열을 우리 필드에 맞추는 규칙.
 *
 * 부서마다 양식이 조금씩 다르므로 **헤더 이름으로 자동 추측하되, 사람이 고칠 수 있게** 만든다.
 * 자동 추측이 틀렸는데 그대로 밀어 넣으면 숫자가 조용히 어긋난다.
 */

export type DataKind = '채권' | '영업파이프라인' | '고정비' | '일회성지출';

export type FieldType = 'text' | 'number' | 'date' | 'percent' | 'enum';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** 헤더에 이 말이 들어 있으면 이 필드로 본다 (앞에 있을수록 우선) */
  aliases: string[];
  /** enum 일 때 허용값 */
  options?: string[];
  hint?: string;
}

export interface KindSpec {
  kind: DataKind;
  label: string;
  /** 이 종류가 채우는 곳 */
  target: string;
  submissionKind: string;
  fields: FieldSpec[];
}

const ENTITY: FieldSpec = {
  key: 'entity',
  label: '법인',
  type: 'text',
  required: true,
  aliases: ['법인', '회사', '사업자', '소속'],
  hint: '회사 설정에 등록한 법인 이름과 같아야 합니다',
};

export const KINDS: KindSpec[] = [
  {
    kind: '채권',
    label: '수금계획 · 매출채권',
    target: 'receivables',
    submissionKind: '수금계획',
    fields: [
      ENTITY,
      {
        key: 'counterparty',
        label: '거래처',
        type: 'text',
        required: true,
        aliases: ['거래처', '매출처', '입금처', '고객', '업체'],
      },
      {
        key: 'kind',
        label: '구분',
        type: 'enum',
        required: false,
        options: ['일반매출', '지원사업'],
        aliases: ['구분', '유형', '매출구분', '사업구분'],
        hint: '비우면 일반매출로 봅니다',
      },
      {
        key: 'issuedOn',
        label: '발행일',
        type: 'date',
        required: false,
        aliases: ['발행일', '세금계산서', '계산서발행', '청구일', '발생일'],
        hint: '있으면 「청구완료」, 없으면 「청구전(수주확정)」으로 봅니다',
      },
      {
        key: 'dueOn',
        label: '회수예정일',
        type: 'date',
        required: true,
        aliases: ['회수예정일', '입금예정일', '수금예정일', '만기일', '예정일'],
      },
      {
        key: 'amountBilled',
        label: '청구금액',
        type: 'number',
        required: true,
        aliases: ['청구금액', '매출액', '금액', '채권액', '공급가액', '합계'],
      },
      {
        key: 'amountCollected',
        label: '받은 금액',
        type: 'number',
        required: false,
        aliases: ['받은금액', '수금액', '입금액', '기수금'],
        hint: '비우면 0 으로 봅니다',
      },
      {
        key: 'termsDays',
        label: '회전일',
        type: 'number',
        required: false,
        aliases: ['회전일', '결제조건', '여신일수'],
      },
      {
        key: 'evidenceNo',
        label: '증빙번호',
        type: 'text',
        required: false,
        aliases: ['증빙번호', '계산서번호', '전표번호'],
      },
    ],
  },
  {
    kind: '영업파이프라인',
    label: '영업 파이프라인 (수주 전)',
    target: 'opportunities',
    submissionKind: '영업파이프라인',
    fields: [
      ENTITY,
      {
        key: 'title',
        label: '건명',
        type: 'text',
        required: true,
        aliases: ['건명', '案件', '프로젝트', '사업명', '내용', '품명'],
      },
      {
        key: 'counterparty',
        label: '거래처',
        type: 'text',
        required: false,
        aliases: ['거래처', '고객', '업체', '발주처'],
      },
      {
        key: 'stage',
        label: '영업단계',
        type: 'enum',
        required: true,
        options: ['발굴', '상담', '견적', '협상', '수주확정', '실주', '보류'],
        aliases: ['영업단계', '단계', '진행상태', '상태'],
      },
      {
        key: 'amountExpected',
        label: '예상금액',
        type: 'number',
        required: true,
        aliases: ['예상금액', '예상매출', '견적금액', '금액', '수주예상'],
      },
      {
        key: 'winRate',
        label: '확률',
        type: 'percent',
        required: false,
        aliases: ['확률', '수주확률', '가능성'],
        hint: '비우면 영업단계 기본값이 붙습니다',
      },
      {
        key: 'expectedDueOn',
        label: '예상 입금일',
        type: 'date',
        required: true,
        aliases: ['예상입금일', '입금예정일', '회수예정일', '예상수금일'],
      },
      {
        key: 'category',
        label: '품목',
        type: 'text',
        required: false,
        aliases: ['품목', '제품', '카테고리', '분류'],
      },
    ],
  },
  {
    kind: '고정비',
    label: '고정비 (매달 반복)',
    target: 'fixed_costs',
    submissionKind: '고정비',
    fields: [
      {
        key: 'item',
        label: '항목',
        type: 'text',
        required: true,
        aliases: ['항목', '비목', '내용', '계정'],
      },
      {
        key: 'monthlyAmount',
        label: '월액',
        type: 'number',
        required: true,
        aliases: ['월액', '월금액', '금액', '월평균'],
      },
      {
        key: 'payDay',
        label: '지급일',
        type: 'number',
        required: true,
        aliases: ['지급일', '결제일', '납부일', '지출일'],
        hint: '1~31 사이의 날짜. 말일보다 크면 말일로 봅니다',
      },
      {
        key: 'accountCode',
        label: '계정과목',
        type: 'text',
        required: false,
        aliases: ['계정과목', '계정', '과목'],
      },
      {
        key: 'shareEntity',
        label: '배분 법인',
        type: 'text',
        required: false,
        aliases: ['법인', '배분법인', '부담법인'],
        hint: '법인별로 나눠 부담하면 법인 이름을, 아니면 비워 둡니다',
      },
      {
        key: 'share',
        label: '배분 비율',
        type: 'percent',
        required: false,
        aliases: ['배분', '비율', '분담률', '부담률'],
        hint: '같은 항목의 비율 합이 100% 여야 합니다',
      },
    ],
  },
  {
    kind: '일회성지출',
    label: '고정비 외 지출 (일회성)',
    target: 'expenses',
    submissionKind: '일회성지출',
    fields: [
      ENTITY,
      {
        key: 'item',
        label: '항목',
        type: 'text',
        required: true,
        aliases: ['항목', '내용', '비목', '적요'],
      },
      {
        key: 'plannedOn',
        label: '예정일',
        type: 'date',
        required: true,
        aliases: ['예정일', '지출예정일', '집행예정일', '결제일', '날짜'],
      },
      {
        key: 'amount',
        label: '금액',
        type: 'number',
        required: true,
        aliases: ['금액', '지출액', '집행액'],
      },
      {
        key: 'category',
        label: '성격',
        type: 'text',
        required: false,
        aliases: ['성격', '분류', '카테고리', '유형'],
        hint: '항목 이름으로 추측하지 않습니다. 여기 값을 그대로 씁니다',
      },
      {
        key: 'execState',
        label: '집행상태',
        type: 'enum',
        required: false,
        options: ['집행', '연기', '취소'],
        aliases: ['집행상태', '집행', '상태'],
        hint: '비우면 「집행」으로 봅니다',
      },
      {
        key: 'deferredTo',
        label: '연기 예정일',
        type: 'date',
        required: false,
        aliases: ['연기', '연기일', '변경일'],
        hint: '집행상태가 「연기」면 필요합니다',
      },
      {
        key: 'approvalState',
        label: '허가상태',
        type: 'enum',
        required: false,
        options: ['미신청', '신청', '보정중', '승인'],
        aliases: ['허가', '허가상태', '승인상태', '결재'],
      },
    ],
  },
];

export const kindSpec = (k: DataKind): KindSpec => KINDS.find((s) => s.kind === k)!;

/** 헤더 문자열을 비교용으로 다듬는다 (공백·괄호·단위 제거) */
export const normalizeHeader = (h: string): string =>
  String(h ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[\s_\-·.]/g, '')
    .replace(/원$|액$/g, '')
    .toLowerCase()
    .trim();

/**
 * 헤더 목록을 필드에 자동으로 맞춘다.
 * 확실하지 않으면 비워 둔다 — 틀린 채로 넣는 것보다 사람이 고르는 게 낫다.
 */
export function autoMap(headers: string[], spec: KindSpec): Record<string, number | null> {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const map: Record<string, number | null> = {};

  for (const field of spec.fields) {
    let found: number | null = null;

    // 1) 별칭과 정확히 같은 헤더
    for (const alias of field.aliases) {
      const a = normalizeHeader(alias);
      const i = norm.findIndex((h, idx) => h === a && !used.has(idx));
      if (i >= 0) {
        found = i;
        break;
      }
    }
    // 2) 별칭을 포함하는 헤더
    if (found === null) {
      for (const alias of field.aliases) {
        const a = normalizeHeader(alias);
        const i = norm.findIndex((h, idx) => h.includes(a) && !used.has(idx));
        if (i >= 0) {
          found = i;
          break;
        }
      }
    }

    if (found !== null) used.add(found);
    map[field.key] = found;
  }
  return map;
}
