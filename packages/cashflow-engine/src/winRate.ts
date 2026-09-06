import type { Opportunity, SalesStage } from './types';

/**
 * G3 · 영업단계별 기본 확률.
 * 관례값이지 실적이 아니다 — 실적이 쌓이면 조직별로 보정한다.
 */
export const STAGE_WIN_RATE: Record<string, number> = {
  상담: 0.3,
  견적: 0.5,
  협상: 0.7,
  수주확정: 1,
  실주: 0,
  보류: 0,
};

/** 기재도 매칭도 안 됐을 때 */
export const DEFAULT_WIN_RATE = 0.5;

/** 직접입력 > 단계 기본값 > 0.5. 직접입력이 있으면 단계를 바꿔도 확률이 안 바뀐다. */
export function winRateOf(o: Pick<Opportunity, 'salesStage' | 'winRateOverride'>): number {
  if (o.winRateOverride != null) return o.winRateOverride;
  const byStage = STAGE_WIN_RATE[o.salesStage as SalesStage];
  return byStage != null ? byStage : DEFAULT_WIN_RATE;
}

/** 파이프라인에서 빠지는 단계 — 이미 수주했거나 죽은 건 */
const EXCLUDED: ReadonlySet<string> = new Set(['수주확정', '실주', '보류']);

export const isLiveOpportunity = (o: Opportunity): boolean => !EXCLUDED.has(o.salesStage);
