'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ageReceivables,
  runCashflow,
  type AgingResult,
  type CashflowInput,
  type CashflowResult,
} from 'cashflow-engine';
import type { Dataset } from './data';

export const TABS = [
  { id: 'today', label: '오늘', sub: '지금 괜찮은가' },
  { id: 'flow', label: '자금흐름', sub: '언제 바닥나는가' },
  { id: 'in', label: '받을 돈', sub: '누가 언제 주는가' },
  { id: 'out', label: '나갈 돈', sub: '무엇을 미룰까' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

/**
 * 법인 이름을 URL 에 실을 수 있게 짧게 바꾼다. 회사마다 법인이 다르므로 고정 표가 없다.
 *
 * 퍼센트 인코딩은 여기서 하지 않는다 — URLSearchParams 가 넣을 때 인코딩하고
 * 꺼낼 때 디코딩한다. 여기서 미리 인코딩하면 꺼낸 값과 영영 안 맞는다.
 */
export const entitySlug = (name: string): string =>
  name.replace(/[()（）\s]/g, '').slice(0, 24);

export const PRESETS = [
  { name: '계획대로', rate: 1, desc: '100% 달성' },
  { name: '다소 지연', rate: 0.8, desc: '매주 80%' },
  { name: '절반만', rate: 0.5, desc: '매주 50%' },
  { name: '악화', rate: 0.35, desc: '매주 35%' },
] as const;

export type SourceKey = 'ar' | 'won' | 'pipe' | 'newSales';

export const SOURCE_META: { key: SourceKey; label: string; what: string; how: string }[] = [
  { key: 'ar', label: '확정 채권', what: '세금계산서 발행 + 회수예정일 있음', how: '전액' },
  { key: 'won', label: '수주 확정', what: '계약O, 청구 전', how: '전액' },
  { key: 'pipe', label: '영업 파이프라인', what: '수주 전', how: '금액 × 확률' },
  { key: 'newSales', label: '신규매출 가정', what: '건도 없는 월별 목표', how: '목표 × 회수율' },
];

export interface ViewState {
  tab: TabId;
  entity: string | null;
  gran: 'week' | 'month';
  /** null = 사용자가 고르지 않음 → 기준일이 속한 주로 연다 */
  weekIndex: number | null;
  rate: number;
  sources: Record<SourceKey, boolean>;
}

interface Store extends Omit<ViewState, 'weekIndex'> {
  /** 실제로 보여줄 주차 (고르지 않았으면 기준일이 속한 주) */
  weekIndex: number;
  data: Dataset;
  result: CashflowResult;
  aging: AgingResult;
  /** 확정 채권만 켰을 때 — 소스 토글 문장·버튼 숫자에 쓴다 */
  arOnly: CashflowResult;
  /** 소스별 단독 총유입 (버튼에 표시) */
  sourceTotals: Record<SourceKey, number>;
  set: (patch: Partial<ViewState>) => void;
  toggleSource: (k: SourceKey) => void;
  buildInput: (over?: Partial<CashflowInput>) => CashflowInput;
}

const Ctx = createContext<Store | null>(null);

export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider 안에서만 쓸 수 있습니다');
  return s;
};

const DEFAULT_SOURCES: Record<SourceKey, boolean> = {
  ar: true,
  won: false,
  pipe: false,
  newSales: true,
};

export function StoreProvider({ data, children }: { data: Dataset; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /* ── URL → 상태 ────────────────────────────────────────────────── */
  const state: ViewState = useMemo(() => {
    const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'today') as TabId;
    const corp = params.get('corp');
    const entity = corp ? (data.entities.find((e) => entitySlug(e) === corp) ?? null) : null;
    const gran = params.get('gran') === 'month' ? 'month' : 'week';
    const wParam = params.get('w');
    const weekIndex = wParam === null ? null : Math.max(0, Number(wParam) || 0);

    // Number('') · Number(null) 은 0 이다. 파라미터가 없을 때 0% 로 떨어지면
    // 화면이 최악 시나리오로 열린다 — 없으면 100% 로 둔다.
    const rateParam = params.get('rate');
    const rateRaw = rateParam === null || rateParam === '' ? Number.NaN : Number(rateParam);
    const rate = Number.isFinite(rateRaw) && rateRaw >= 0 && rateRaw <= 100 ? rateRaw / 100 : 1;

    const src = params.get('src');
    let sources = { ...DEFAULT_SOURCES };
    if (src != null) {
      const on = new Set(src.split(',').filter(Boolean));
      sources = { ar: on.has('ar'), won: on.has('won'), pipe: on.has('pipe'), newSales: on.has('new') };
      // 최소 1개는 켜져 있어야 한다
      if (!Object.values(sources).some(Boolean)) sources = { ...DEFAULT_SOURCES };
    }
    return { tab, entity, gran, weekIndex, rate, sources };
  }, [params, data.entities]);

  /* ── 상태 → URL (회의 중 링크로 공유하기 위해서다) ──────────────── */
  const set = useCallback(
    (patch: Partial<ViewState>) => {
      const next = { ...state, ...patch };
      const q = new URLSearchParams();
      if (next.tab !== 'today') q.set('tab', next.tab);
      if (next.entity) q.set('corp', entitySlug(next.entity));
      if (next.gran !== 'week') q.set('gran', next.gran);
      if (next.weekIndex != null) q.set('w', String(next.weekIndex));
      if (next.rate !== 1) q.set('rate', String(Math.round(next.rate * 100)));
      const on = [
        next.sources.ar && 'ar',
        next.sources.won && 'won',
        next.sources.pipe && 'pipe',
        next.sources.newSales && 'new',
      ].filter(Boolean) as string[];
      const isDefault =
        on.length === 2 && on.includes('ar') && on.includes('new');
      if (!isDefault) q.set('src', on.join(','));

      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [state, router, pathname],
  );

  const toggleSource = useCallback(
    (k: SourceKey) => {
      const next = { ...state.sources, [k]: !state.sources[k] };
      // 최소 1개는 켜져 있어야 한다
      if (!Object.values(next).some(Boolean)) return;
      set({ sources: next });
    },
    [state.sources, set],
  );

  const buildInput = useCallback(
    (over: Partial<CashflowInput> = {}): CashflowInput => ({
      asOf: data.asOf,
      startDate: data.defaults.startDate,
      weeks: data.defaults.weeks,
      openingCash: data.defaults.openingCash,
      warnLine: data.defaults.warnLine,
      entityFilter: state.entity,
      achievementRate: state.rate,
      sources: state.sources,
      receivables: data.receivables,
      opportunities: data.opportunities,
      fixedCosts: data.fixedCosts,
      expenses: data.expenses,
      assumptions: data.assumptions,
      ...over,
    }),
    [data, state.entity, state.rate, state.sources],
  );

  const result = useMemo(() => runCashflow(buildInput()), [buildInput]);

  const arOnly = useMemo(
    () => runCashflow(buildInput({ sources: { ar: true, won: false, pipe: false, newSales: false } })),
    [buildInput],
  );

  const sourceTotals = useMemo(() => {
    const one = (k: SourceKey) =>
      runCashflow(
        buildInput({
          achievementRate: 1,
          sources: { ar: false, won: false, pipe: false, newSales: false, [k]: true },
        }),
      ).totalIn;
    return { ar: one('ar'), won: one('won'), pipe: one('pipe'), newSales: one('newSales') };
  }, [buildInput]);

  const aging = useMemo(
    () => ageReceivables(data.agingLedger, data.asOf, { entityFilter: state.entity }),
    [data.agingLedger, data.asOf, state.entity],
  );

  // 고르지 않았으면 기준일이 속한 주로 연다. 8/1 은 유입이 없는 이틀짜리 주라
  // 거기서 열면 「주간 입금 계획」이 전부 0 으로 보인다.
  const asOfWeek = useMemo(() => {
    const i = result.weeks.findIndex((w) => data.asOf >= w.start && data.asOf <= w.end);
    return i >= 0 ? i : 0;
  }, [result.weeks, data.asOf]);

  const last = Math.max(0, result.weeks.length - 1);
  const weekIndex = state.weekIndex == null ? asOfWeek : Math.min(state.weekIndex, last);

  const value: Store = {
    ...state,
    weekIndex,
    data,
    result,
    aging,
    arOnly,
    sourceTotals,
    set,
    toggleSource,
    buildInput,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ── 결론 판정 (탭① 1.1) ──────────────────────────────────────────── */
export type Tone = 'good' | 'warn' | 'crit';

export function verdictOf(r: CashflowResult, warnLine: number) {
  if (r.bottom) {
    return {
      tone: 'crit' as Tone,
      icon: '●',
      title: '위험',
      // 필요 금액 = 안전선까지 메워야 하는 돈
      need: r.shortfall,
      week: r.bottom,
    };
  }
  if (r.min.cash < warnLine) {
    return { tone: 'warn' as Tone, icon: '●', title: '주의', need: r.shortfall, week: r.min };
  }
  return { tone: 'good' as Tone, icon: '●', title: '안전', need: 0, week: r.min };
}
