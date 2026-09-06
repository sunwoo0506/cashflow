/**
 * 금액 표기 (docs/04).
 * 항상 toLocaleString('ko-KR'). 음수는 △ 를 앞에 붙인다 (회계 관행).
 */

/** 1,662,327,588 · 음수는 △1,234 */
export const fmt = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return '-';
  return (n < 0 ? '△' : '') + Math.round(Math.abs(n)).toLocaleString('ko-KR');
};

/** 16.6억원 · 3,250만원 — 본 숫자 아래 보조로만 쓴다 */
export const won = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return '-';
  const a = Math.abs(n);
  const s = n < 0 ? '△' : '';
  if (a >= 100_000_000) return `${s}${(a / 100_000_000).toFixed(a >= 1_000_000_000 ? 0 : 1)}억원`;
  if (a >= 10_000) return `${s}${Math.round(a / 10_000).toLocaleString('ko-KR')}만원`;
  return `${s}${Math.round(a).toLocaleString('ko-KR')}원`;
};

/** 'YYYY-MM-DD' → '8월 13일' */
export const kdate = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
};

/** 'YYYY-MM-DD' → '8/13' */
export const mdate = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export const pct = (n: number): string => `${Math.round(n * 100)}%`;
