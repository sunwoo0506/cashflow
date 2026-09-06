/**
 * 골든 테스트용 **가상** 데이터를 만든다.
 *
 * 저장소에 실제 거래처·담당자·금액을 두지 않기 위해서다.
 * 구조와 규모는 실제 원장과 같게 두어 (채권 107건 · 고정비 9건 · 지출 61건),
 * 주 나누기·월 경계·연체·이월 같은 경로가 전부 실행되게 한다.
 *
 * 난수는 고정 시드를 쓴다 — 돌릴 때마다 같은 파일이 나와야 골든 테스트가 성립한다.
 *
 *   node scripts/make-fixture.mjs > __fixtures__/demo-2026-08-13.json
 */

/* ── 고정 시드 난수 (mulberry32) ─────────────────────────────── */
let _s = 20260813;
const rnd = () => {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
/** 만원 단위로 떨어지는 금액 */
const money = (loMan, hiMan) => between(loMan, hiMan) * 10000;

const AS_OF = '2026-08-13';
const YEAR = 2026;

const ENTITY_A = '법인A';
const ENTITY_B = '법인B';
const CORPS = [ENTITY_A, ENTITY_B];

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (isoStr, n) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return t.toISOString().slice(0, 10);
};

/* ── 거래처 · 사람 (전부 가상) ───────────────────────────────── */
const CUSTOMERS = Array.from({ length: 40 }, (_, i) => `거래처${String(i + 1).padStart(3, '0')}`);
const MANAGERS = Array.from({ length: 6 }, (_, i) => `담당자${i + 1}`);
const BENEFICIARIES = Array.from({ length: 24 }, (_, i) => `수혜자${String(i + 1).padStart(2, '0')}`);
/** 그룹 내부 거래처 — 외부 채권 집계에서 빠지는지 검증하는 데 쓴다 */
const INTERNAL = '내부법인';

/* ── 1) 일반매출 채권 ────────────────────────────────────────── */
const inflowGen = [];

// 연체 건 (기준일보다 과거) — R3 「이미 늦은 돈은 지금 받는다」 경로
for (let i = 0; i < 14; i++) {
  const due = iso(YEAR, between(3, 8), between(1, 28));
  inflowGen.push({
    corp: pick(CORPS),
    name: pick(CUSTOMERS),
    mgr: pick(MANAGERS),
    turn: pick([30, 45, 60]),
    amt: money(5, 900),
    due,
    od: due < AS_OF,
  });
}
// 정상 건 — 8월 중순부터 12월 말까지 고르게
for (let i = 0; i < 55; i++) {
  const due = addDays(AS_OF, between(1, 140));
  inflowGen.push({
    corp: pick(CORPS),
    name: pick(CUSTOMERS),
    mgr: pick(MANAGERS),
    turn: pick([30, 60]),
    amt: money(50, 4200),
    due,
    od: false,
  });
}
// 그룹 내부 채권 1건 (큰 금액)
inflowGen.push({
  corp: ENTITY_B,
  name: INTERNAL,
  mgr: pick(MANAGERS),
  turn: 90,
  amt: 223_000_000,
  due: addDays(AS_OF, 16),
  od: false,
});

/* ── 2) 지원사업 채권 ────────────────────────────────────────── */
const inflowJw = [];
for (let i = 0; i < 34; i++) {
  const due = i < 6 ? iso(YEAR, between(6, 8), between(1, 28)) : addDays(AS_OF, between(1, 135));
  inflowJw.push({
    corp: pick(CORPS),
    name: pick(BENEFICIARIES),
    biz: pick(['원지정비', '토양피복', '성목이식', '차세대']),
    amt: money(60, 2500),
    due,
  });
}

/* ── 3) 고정비 ───────────────────────────────────────────────── */
const fixed = [
  { item: '급여', amt: 92_000_000, day: 25, share: 0.45 },
  { item: '수도광열·통신', amt: 3_200_000, day: 20, share: 0.5 },
  { item: '기타 판관비', amt: 4_200_000, day: 25, share: 0.5 },
  { item: '4대보험·퇴직급여', amt: 9_200_000, day: 10, share: 0.45 },
  { item: '임차료', amt: 8_500_000, day: 1, share: 0.5 },
  { item: '차량유지·유류', amt: 2_800_000, day: 15, share: 0.4 },
  { item: '지급수수료·전산', amt: 2_400_000, day: 15, share: 0.5 },
  { item: '보험료', amt: 1_800_000, day: 10, share: 0.5 },
  { item: '원천세·지방소득세', amt: 5_400_000, day: 10, share: 0.45 },
];

/* ── 4) 일회성 지출 ──────────────────────────────────────────── */
const EXPENSE_ITEMS = [
  '상품 매입 대금',
  '원부자재 매입 정산',
  '외주 시공비 정산',
  '차입금 이자',
  '장비 리스료',
  '포장·물류비',
  '소모품·공구 구매',
  '보험료 정산',
  '세금 납부',
  '급여 정산',
  '시설 보수비',
  '전산 유지보수',
];
const oneoff = [];
{
  let d = iso(YEAR, 8, 11);
  let n = 0;
  while (d <= iso(YEAR, 12, 31) && n < 61) {
    oneoff.push({
      item: `${pick(EXPENSE_ITEMS)} (${n + 1}차)`,
      date: d,
      amt: money(280, 4700),
      corp: pick(CORPS),
      on: true,
      id: `i${n}`,
    });
    d = addDays(d, between(1, 4));
    n++;
  }
}

/* ── 5) 집계 (행에서 뽑는다 — 저장하지 않는다) ──────────────── */
const datedTotal =
  inflowGen.reduce((s, r) => s + r.amt, 0) + inflowJw.reduce((s, r) => s + r.amt, 0);
/** 회수예정일이 아직 안 잡힌 몫 — 연령분석의 「미정」 버킷 */
const undated = 259_000_000;
const arTotal = datedTotal + undated;

const byCorpKind = [];
for (const corp of CORPS) {
  byCorpKind.push({
    법인: corp,
    구분: '일반매출',
    금액: inflowGen.filter((r) => r.corp === corp).reduce((s, r) => s + r.amt, 0),
  });
}
for (const corp of CORPS) {
  byCorpKind.push({
    법인: corp,
    구분: '지원사업',
    금액: inflowJw.filter((r) => r.corp === corp).reduce((s, r) => s + r.amt, 0),
  });
}

const balByCp = new Map();
for (const r of inflowGen) {
  const k = `${r.corp}|${r.name}`;
  balByCp.set(k, (balByCp.get(k) ?? 0) + r.amt);
}
const top = [...balByCp.entries()]
  .map(([k, 잔액]) => {
    const [법인, 거래처] = k.split('|');
    return { 법인, 거래처, 잔액 };
  })
  .sort((a, b) => b.잔액 - a.잔액)
  .slice(0, 10);

/** 선수금·반품으로 잔액이 음수가 된 건 */
const neg = Array.from({ length: 11 }, () => ({
  법인: pick(CORPS),
  거래처: pick(CUSTOMERS),
  잔액: -money(1, 760),
}));

const seed = {
  meta: { generated: AS_OF, opening: 150_000_000, note: '가상 데이터 — 실제 거래 정보가 아닙니다' },
  inflowGen,
  inflowJw,
  jwAR: inflowJw.reduce((s, r) => s + r.amt, 0) + 260_000_000,
  jwPlanTax: 251_000_000,
  execRate: 0.6759,
  fixed,
  oneoff,
  ar: { total: arTotal, by_corp_kind: byCorpKind, top, neg },
  jiwon: { lines: 25, tax: 277_000_000, plan: 186_000_000, paid: 57_000_000 },
  lastM: 7,
  __demo_pipeline__: [
    { corp: ENTITY_B, name: '관수시설 공급', stage: '협상', cat: '자재', amt: 120_000_000, due: '2026-11-20' },
    { corp: ENTITY_A, name: '기계 보급사업', stage: '견적', cat: '자재', amt: 85_000_000, due: '2026-12-10' },
    { corp: ENTITY_A, name: '자재 공급', stage: '상담', cat: '식품', amt: 40_000_000, due: '2026-11-05' },
  ],
  __demo_won__: [
    { corp: ENTITY_A, name: '스마트팜 자재 납품', cat: '자재', amt: 45_000_000, due: '2026-10-15' },
    { corp: ENTITY_B, name: '유통센터 물품 공급', cat: '농산물', amt: 28_000_000, due: '2026-09-30' },
  ],
};

process.stdout.write(JSON.stringify(seed));
