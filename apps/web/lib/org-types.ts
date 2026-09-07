/** 서버·클라이언트가 같이 쓰는 타입과 상수. 여기엔 서버 전용 코드를 두지 않는다. */

export type Role = 'owner' | 'manager' | 'staff' | 'viewer';

export interface Org {
  id: string;
  name: string;
  slug: string;
  role: Role;
  /** 샘플 데이터를 넣은 회사면 그 시각. 화면에 「샘플」 배지를 띄우는 근거. */
  sampleSeededAt?: string | null;
}

/** 법인 — 한 회사(org) 아래 여러 법인이 있을 수 있다 */
export interface Entity {
  id: string;
  name: string;
  shortName: string | null;
  sortNo: number;
}

export interface OrgMember {
  userId: string;
  email: string;
  role: Role;
  createdAt: string;
}

export const ORG_COOKIE_NAME = 'org';

export const ROLE_LABEL: Record<Role, string> = {
  owner: '소유자',
  manager: '관리자',
  staff: '담당자',
  viewer: '조회만',
};
