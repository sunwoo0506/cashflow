import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 골든 기대값. `test/snapshot.test.ts` 가 만든다 (GEN=1 로 갱신).
 *
 * 값을 손으로 고치지 않는다. 계산을 바꿔서 값이 달라졌다면
 * **왜 달라졌는지 확인한 뒤** 다시 생성한다 — 그게 이 파일의 존재 이유다.
 */
export interface Golden {
  asOf: string;
  openingCash: number;
  warnLine: number;
  g1: {
    weeks: number;
    months: number;
    totalIn: number;
    totalOut: number;
    endCash: number;
    minCash: number;
    minCode: string;
    bottom: string | null;
    shortfall: number;
    unpaid: number;
  };
  g2: {
    arOnly: number;
    plusWon: number;
    plusPipe: number;
    all: number;
    arPlusNew: number;
    soloAr: number;
    soloWon: number;
    soloPipe: number;
    soloNewSales: number;
  };
  g5: {
    buckets: Record<string, number>;
    total: number;
    over60: number;
    internalTotal: number;
    negativeCount: number;
    negativeSum: number;
  };
  g7: {
    rate: number;
    totalIn: number;
    endCash: number;
    minCode: string;
    minCash: number;
    bottom: string | null;
    shortfall: number;
    unpaid: number;
  }[];
  g8: {
    entity: string | null;
    totalIn: number;
    totalOut: number;
    endCash: number;
    minCode: string;
    minCash: number;
  }[];
  g9: {
    targetId: string;
    targetItem: string;
    targetAmount: number;
    targetDate: string;
    baseTotalOut: number;
    baseEndCash: number;
    deferDefault: Record<string, number>;
    cancel: { delta: Record<string, number>; totalOut: number; endCash: number };
    deferOut: { delta: Record<string, number>; totalOut: number };
  };
  r5: {
    newSalesByRow: Record<string, number>;
    pipelineExpected: number;
    grossNewSales: number;
  };
  weekLabels: Record<string, string>;
}

export const GOLDEN: Golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('../__fixtures__/golden-expected.json', import.meta.url)), 'utf8'),
);
