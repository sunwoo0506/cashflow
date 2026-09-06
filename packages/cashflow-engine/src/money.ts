/**
 * 금액은 정수 원 단위로만 다룬다. float 를 누적하지 않는다 (CLAUDE.md 규칙 6).
 */

/** 원 단위 정수로 맞춘다 */
export const won = (n: number): number => Math.round(n);

/**
 * total 을 ratios 비율로 쪼갠다.
 *
 * 조각마다 따로 반올림하면 **누적합**이 조금씩 밀린다. 자금 화면에서 사람이 실제로 읽는 것은
 * 각 조각이 아니라 그 주까지의 잔고, 즉 누적합이다. 그래서 조각을 반올림하지 않고
 * **누적합을 반올림한 뒤 그 차이를 조각으로 삼는다.**
 *
 *   조각ₖ = round(정확한 누적합ₖ) − round(정확한 누적합ₖ₋₁)
 *
 * 이렇게 하면 두 가지가 동시에 지켜진다.
 * - 조각의 합 = round(total)          — 합계가 정확하다
 * - 모든 구간의 누적합 오차 ≤ 0.5원   — 잔고가 밀리지 않는다
 *
 * 조각의 순서가 곧 시간 순서라고 보고 자른다. 부르는 쪽이 시간 순으로 넘겨야 한다.
 */
export function splitByRatio(total: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum === 0 || ratios.length === 0) return ratios.map(() => 0);

  const out: number[] = [];
  let exact = 0;
  let placed = 0;
  for (const r of ratios) {
    exact += (total * r) / sum;
    const upto = Math.round(exact);
    out.push(upto - placed);
    placed = upto;
  }
  return out;
}
