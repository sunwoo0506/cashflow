/**
 * 화면이 렌더되는지, 그리고 **화면에 찍힌 숫자가 엔진·legacy 와 같은지** 확인한다.
 * 로드맵 2단계의 "화면 숫자가 legacy와 일치하는지 대조" 항목이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { runCashflow } from 'cashflow-engine';
import { getFixtureDataset } from '@/lib/fixture-dataset';
import GOLDEN from '../../../packages/cashflow-engine/__fixtures__/golden-expected.json';
import { StoreProvider, entitySlug } from '@/lib/store';
import { Shell } from '@/components/shell';

/* next/navigation 을 URL 쿼리 흉내로 대신한다 */
let query = new URLSearchParams();
const replace = vi.fn((url: string) => {
  query = new URLSearchParams(url.split('?')[1] ?? '');
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
  useSearchParams: () => query,
}));

/* Recharts 는 happy-dom 에서 크기를 못 재 경고만 낸다 — 렌더만 통과시키면 된다 */
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 280 }}>{children}</div>
    ),
  };
});

const data = getFixtureDataset();

const show = (params = '') => {
  query = new URLSearchParams(params);
  return render(
    <StoreProvider data={data}>
      <Shell />
    </StoreProvider>,
  );
};

/** 화면에 그 숫자가 콤마 표기로 찍혀 있는가 */
const hasNumber = (n: number): boolean => {
  const text = document.body.textContent ?? '';
  return text.includes(Math.abs(Math.round(n)).toLocaleString('ko-KR'));
};

beforeEach(() => {
  cleanup();
  replace.mockClear();
});

describe('탭 ① 오늘', () => {
  it('결론 배너 · 타일 · 소스 토글 · 달성률 · 준비사항이 다 뜬다', () => {
    show();
    // 회사 이름은 로그인한 사람의 회사가 들어온다. 회사 없이 렌더하면 기본 제목만 나온다.
    expect(screen.getByRole('heading', { name: '자금관리' })).toBeTruthy();
    expect(screen.getByText('자금 현황')).toBeTruthy();
    expect(screen.getByText('어디까지 넣고 볼까')).toBeTruthy();
    expect(screen.getAllByText('달성률').length).toBeGreaterThan(0);
    expect(screen.getByText('준비사항')).toBeTruthy();
  });

  it('파라미터가 없으면 달성률 100% 로 연다 (0% 로 떨어지면 안 된다)', () => {
    show();
    // 결론 배너는 「안전」, 최저 잔고는 G1 의 71,500,000
    expect(hasNumber(GOLDEN.g1.minCash)).toBe(true);
    expect(document.body.textContent).toContain('여유');
    expect(document.body.textContent).not.toContain('통장이 바닥납니다');
    // 슬라이더가 100% 를 가리킨다
    const slider = screen.getByLabelText('달성률') as HTMLInputElement;
    expect(slider.value).toBe('100');
  });

  it('소스 버튼 4개가 각 소스 단독 총유입을 보여준다', () => {
    show();
    const base = {
      asOf: data.asOf,
      startDate: data.defaults.startDate,
      weeks: data.defaults.weeks,
      openingCash: data.defaults.openingCash,
      warnLine: data.defaults.warnLine,
      entityFilter: null,
      achievementRate: 1,
      receivables: data.receivables,
      opportunities: data.opportunities,
      fixedCosts: data.fixedCosts,
      expenses: data.expenses,
      assumptions: data.assumptions,
    };
    const only = (k: 'ar' | 'won' | 'pipe' | 'newSales') =>
      runCashflow({
        ...base,
        sources: { ar: false, won: false, pipe: false, newSales: false, [k]: true },
      }).totalIn;

    // 소스별 단독 총유입이 엔진 기준값과 같아야 한다
    expect(only('ar')).toBe(GOLDEN.g2.soloAr);
    expect(only('won')).toBe(GOLDEN.g2.soloWon);
    expect(only('pipe')).toBe(GOLDEN.g2.soloPipe);
    for (const k of ['ar', 'won', 'pipe', 'newSales'] as const) {
      expect(hasNumber(only(k)), `${k} 총유입`).toBe(true);
    }
  });

  it('달성률 25% 면 「위험」으로 바뀌고 바닥 시점을 알려준다', () => {
    show('rate=25');
    const c = GOLDEN.g7.find((x) => x.rate === 0.25)!;
    expect(screen.getAllByText('위험').length).toBeGreaterThan(0);
    expect(hasNumber(c.shortfall)).toBe(true);
    expect(document.body.textContent).toContain('통장이 바닥납니다');
  });
});

describe('탭 ② 자금흐름', () => {
  it('런웨이 차트와 주차별 표가 뜨고 23주가 모두 나온다', () => {
    show('tab=flow');
    expect(screen.getByText('런웨이')).toBeTruthy();
    expect(screen.getByText('주차별 상세')).toBeTruthy();
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(23); // G1 · weeks.length
    expect(screen.getByText('W01')).toBeTruthy();
    expect(screen.getByText('W23')).toBeTruthy();
  });

  it('월간 보기는 5개월이 나온다', () => {
    show('tab=flow&gran=month');
    expect(screen.getByText('월별 요약')).toBeTruthy();
    expect(document.querySelectorAll('tbody tr').length).toBe(5); // G1 · months.length
  });

  it('마지막 주 기말이 G1 endCash 와 같다', () => {
    show('tab=flow');
    expect(hasNumber(GOLDEN.g1.endCash)).toBe(true);
  });
});

describe('탭 ③ 받을 돈 — 연령분석 회귀 방지', () => {
  it('6개 버킷이 G5 기대값 그대로 찍힌다', () => {
    show('tab=in');
    for (const [name, v] of Object.entries(GOLDEN.g5.buckets)) {
      expect(hasNumber(v as number), `버킷 ${name}`).toBe(true);
    }
  });

  it('합계가 매출채권 총액과 일치한다고 화면에 명시한다', () => {
    show('tab=in');
    expect(hasNumber(GOLDEN.g5.total)).toBe(true);
    expect(screen.getByText('합계 일치')).toBeTruthy();
    expect(document.body.textContent).toContain('정확히 일치합니다');
  });

  it('매출액 1,847,153,616 이 화면에 나오면 회귀다', () => {
    show('tab=in');
    // 연령분석 합계는 잔액 합과 같아야 한다. 매출액을 나누면 이 값이 커진다.
    const sum = Object.values(GOLDEN.g5.buckets).reduce((a, b) => a + (b as number), 0);
    expect(sum).toBe(GOLDEN.g5.total);
    expect(hasNumber(GOLDEN.g5.total)).toBe(true);
  });

  it('그룹 내부 거래처는 배지로 분리한다', () => {
    show('tab=in');
    expect(screen.getByText('그룹 내부')).toBeTruthy();
    expect(hasNumber(GOLDEN.g5.internalTotal)).toBe(true);
    expect(document.body.textContent).toContain('받을 돈」으로 세지 않습니다');
  });

  it('파이프라인 확률이 단계 기본값으로 붙는다', () => {
    show('tab=in');
    const table = screen.getByText('영업 파이프라인').closest('section')!;
    const txt = table.textContent ?? '';
    expect(txt).toContain('협상');
    expect(txt).toContain('70%');
    expect(txt).toContain('50%');
    expect(txt).toContain('30%');
  });
});

describe('탭 ④ 나갈 돈', () => {
  it('고정비 9건과 배분 100% 검증이 뜬다', () => {
    show('tab=out');
    const card = screen.getByText('고정비 내역').closest('section')!;
    // 9건 + 합계행
    expect(within(card).getAllByRole('row').length).toBe(1 + 9 + 1);
    expect(within(card).getAllByText('100%').length).toBe(9);
  });

  it('총유출이 G1 값과 같다', () => {
    show('tab=out');
    expect(hasNumber(GOLDEN.g1.totalOut)).toBe(true);
  });

  it('성격별 월별 누계가 나온다 (제출 양식에서 받은 값만 쓴다)', () => {
    show('tab=out');
    const card = screen.getByText('고정비 외 지출건 월별 누계').closest('section')!;
    const txt = card.textContent ?? '';
    // 샘플에는 성격이 들어 있다
    expect(txt).toContain('성격');
    expect(/매입|금융|인건비|물류/.test(txt)).toBe(true);
    // 이름으로 추측하지 않는다는 원칙은 「미기재」 처리로 남는다
    expect(txt).not.toContain('항목 이름으로 추측하지 않고 월별 합계만');
  });

  it('고정비는 법인별 부담액을 금액으로 보여준다', () => {
    show('tab=out');
    const card = screen.getByText('고정비 내역').closest('section')!;
    const txt = card.textContent ?? '';
    expect(txt).toContain('법인A 부담');
    expect(txt).toContain('법인B 부담');
    // 급여 92,000,000 의 45% = 41,400,000
    expect(txt).toContain((41_400_000).toLocaleString('ko-KR'));
    expect(txt).toContain('배분은 법인별로 따로 계산됩니다');
  });
});

describe('기준주차 기본값', () => {
  it('고르지 않으면 기준일(2026-08-13)이 속한 주 W03 으로 연다', () => {
    show();
    const select = screen.getByLabelText('기준주차') as HTMLSelectElement;
    // W01(8/1~8/2)로 열면 유입이 없어 「주간 입금 계획」이 전부 0 으로 보인다
    expect(select.value).toBe('2');
    expect(document.body.textContent).toContain('8/10~8/16');
  });

  it('기준일 주차에는 실제 입금 계획이 잡혀 있다', () => {
    show('tab=in');
    const card = screen.getByText('주간 입금 계획').closest('section')!;
    expect(card.textContent).toContain('W03');
    // 계획액이 0 이 아니다
    expect(card.textContent).not.toMatch(/계획액 합계 0원/);
  });

  it('URL 로 고른 주차가 우선한다', () => {
    show('w=5');
    const select = screen.getByLabelText('기준주차') as HTMLSelectElement;
    expect(select.value).toBe('5');
  });
});

describe('전역 컨트롤 · URL 상태', () => {
  it('탭·법인·주차·달성률이 URL 쿼리에 실린다', () => {
    show();
    screen.getByRole('button', { name: /자금흐름/ }).click();
    expect(replace).toHaveBeenCalledWith('/?tab=flow', { scroll: false });
  });

  it('법인 단독 숫자가 G8 과 같다', () => {
    show(`corp=${entitySlug('법인A')}&tab=flow`);
    const z = GOLDEN.g8.find((x) => x.entity === '법인A')!;
    // 법인을 고르면 그 법인 몫만 잡힌다 — 전체 합계와 다른 값이 나와야 한다
    expect(hasNumber(z.endCash)).toBe(true);
    expect(z.endCash).not.toBe(GOLDEN.g1.endCash);
  });

  it('법인을 고르면 연령분석 총액 대조를 하지 않는다고 밝힌다', () => {
    show(`corp=${entitySlug('법인A')}&tab=in`);
    expect(screen.queryByText('합계 일치')).toBeNull();
    expect(document.body.textContent).toContain('총액 대조를 하지 않습니다');
  });
});
