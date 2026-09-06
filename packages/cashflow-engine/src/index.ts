export { runCashflow } from './run';
export { ageReceivables, AGING_BUCKETS } from './aging';
export { winRateOf, isLiveOpportunity, STAGE_WIN_RATE, DEFAULT_WIN_RATE } from './winRate';
export { buildHorizon, buildWeeks, buildSegments } from './periods';
export { splitByRatio, won } from './money';
export * from './types';
export {
  fromLegacySeed,
  legacyAgingLedger,
  legacyReceivables,
  legacyOpportunities,
  legacyFixedCosts,
  legacyExpenses,
  legacyAssumptions,
  type LegacySeed,
} from './adapters/legacySeed';
