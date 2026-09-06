# 04 · 디자인 시스템

사내 다른 서비스와 같은 계열의 웜 뉴트럴 바탕에, **메인 컬러를 그린**으로 잡는다.
자금 화면이라 색이 곧 판단이므로, 브랜드색과 상태색이 섞이지 않게 역할을 나눈다.

## 토큰

```css
:root {
  color-scheme: light;

  /* 바탕 — 사내 다른 서비스과 같은 웜 뉴트럴 */
  --bg:          #f6f6f4;
  --surface-1:   #fcfcfb;
  --surface-2:   #f0efec;
  --line:        #e2e1dd;
  --text-primary:   #0b0b0b;
  --text-secondary: #52514e;
  --text-muted:     #84837e;

  /* 브랜드 그린 */
  --brand:        #166b3c;   /* 본문·링크·강조 텍스트   6.39:1 */
  --brand-accent: #1f8a4c;   /* 버튼·활성 탭·도형      4.26:1 */
  --brand-soft:   #e8f3ec;   /* 선택 배경 */
  --brand-line:   #bfe0cd;

  /* 상태 — 브랜드와 겹치지 않게 한 단계 다르게 잡는다 */
  --good: #0f7a3d;  --warn: #a86a00;  --crit: #c02b2b;
  --good-soft: #e6f4ea;  --warn-soft: #fdf3e0;  --crit-soft: #fdeaea;

  /* 차트 카테고리 — 이 순서 그대로 쓴다 */
  --c1: #1f8a4c;  /* green   */
  --c2: #4a3aa7;  /* violet  */
  --c3: #eb6834;  /* orange  */
  --c4: #2a78d6;  /* blue    */
  --c5: #e87ba4;  /* magenta */
  --c6: #eda100;  /* yellow  */

  /* 채권 연령 — 한 계열 순차 램프 (밝을수록 최근) */
  --age1: #fadfd0; --age2: #f3b391; --age3: #e8845a;
  --age4: #d15b34; --age5: #a63c1e; --age6: #c9c8c3;  /* 미정 = 중립 */
}

:root[data-theme="dark"],
:root:not([data-theme="light"]) { /* @media (prefers-color-scheme: dark) 안에 */
  color-scheme: dark;
  --bg: #111110; --surface-1: #1a1a19; --surface-2: #232322; --line: #333331;
  --text-primary: #fff; --text-secondary: #c3c2b7; --text-muted: #8e8d85;

  --brand: #3ec27a; --brand-accent: #2fa562;
  --brand-soft: #16301f; --brand-line: #2a5c3d;

  --good: #4cc47e; --warn: #e0a72c; --crit: #f07070;
  --good-soft: #14301d; --warn-soft: #33270c; --crit-soft: #341a1a;

  --c1: #2fa562; --c2: #9085e9; --c3: #d95926;
  --c4: #3987e5; --c5: #d55181; --c6: #c98500;

  --age1: #5a2f1e; --age2: #8a4526; --age3: #c26237;
  --age4: #e08055; --age5: #f0a883; --age6: #4a4a47;
}
```

다크 값은 라이트를 뒤집은 게 아니라 다크 표면에 맞춰 따로 고른 값이다. 두 블록 모두에 정의한다
(미디어 쿼리는 OS 설정, `[data-theme]`은 사용자 토글 — 토글이 양방향으로 이겨야 한다).

## 검증 결과 (근거)

`dataviz` 검증기로 확인함. 팔레트를 바꾸면 다시 돌린다.

```
카테고리 6색 · 라이트(#fcfcfb) : 명도대역 PASS · 채도 PASS · CVD PASS(최악 13.0)
                                 정상시각 PASS(19.6) · 대비 WARN(--c5, --c6)
카테고리 6색 · 다크(#1a1a19)   : 전 항목 PASS · 대비 전부 3:1 이상
```

`--c5`(magenta) `--c6`(yellow)는 라이트에서 표면 대비 3:1 미만이다.
→ **그 두 슬롯을 쓸 때는 직접 라벨이나 표를 반드시 같이 낸다.** 색만으로 구분하게 두지 않는다.

WCAG 대비 (본문 기준 4.5:1):

| 토큰 | 라이트 | 다크 |
|---|---|---|
| `--brand` | 6.39:1 ✅ | 7.63:1 ✅ |
| `--brand-accent` | 4.26:1 (큰 글씨·도형) | 5.54:1 ✅ |
| `--good` | 5.28:1 ✅ | 7.88:1 ✅ |
| `--warn` | 4.33:1 (큰 글씨·도형) | 8.07:1 ✅ |
| `--crit` | 5.65:1 ✅ | 6.02:1 ✅ |

## 색 사용 규칙

1. **상태색은 예약어다.** good/warn/crit을 차트 시리즈 색으로 쓰지 않는다.
2. **상태는 색 단독으로 표시하지 않는다.** 항상 아이콘 + 글자를 같이 낸다 (「● 안전」).
3. **카테고리 색은 고정 순서로 배정한다.** 필터로 시리즈가 줄어도 남은 것의 색은 바뀌지 않는다.
4. **연령 램프는 한 계열 순차**다. 무지개로 만들지 않는다. 「미정」만 중립 회색.
5. **숫자·라벨은 텍스트 토큰**을 쓴다. 시리즈 색으로 글자를 칠하지 않는다.
6. **축 두 개짜리 차트를 만들지 않는다.** 단위가 다르면 차트를 나눈다.

## 타이포

```
본문   Pretendard → 맑은 고딕 → system-ui      15px / 1.55
숫자   font-variant-numeric: tabular-nums      필수 (표·타일 전부)
제목   h1 17px/650 · h2 14px/650 · 결론 배너 clamp(20px, 3.2vw, 29px)/750
캡션   12px, --text-muted
```

금액은 항상 `toLocaleString('ko-KR')`. 음수는 `△`로 앞에 붙인다 (회계 관행).
억/만 단위 요약은 본 숫자 아래 보조로만 (`1,662,327,588` 아래 `16.6억원`).

## 컴포넌트

| 이름 | 규격 |
|---|---|
| `Card` | radius 16, `--surface-1`, 1px `--line`, padding 16/18 |
| `Tile` | 6열 그리드(≤820px 3열, ≤640px 2열), 라벨 11.5px + 값 clamp(15,1.6vw,19)/750 + 보조 11px |
| `Tabs` | sticky top, 가로 스크롤, 활성 탭 `--brand-accent` 배경 + 흰 글자, ≤640px 부제 숨김 |
| `Seg` | 라디오형 세그먼트. 활성 `--brand-accent` |
| `SrcToggle` | 4열 체크형 카드. 켜짐 = `--brand-accent` 테두리 + `--brand-soft` 배경 |
| `Badge` | 11px, radius 4. 종류: 구분 / 확률 / 상태 / 그룹 내부 |
| `Verdict` | 좌측 6px 상태 바, 상태색은 `--vc` 변수로 주입 |
| `StackBar` | 세그먼트 사이 2px 표면 갭, 8% 이상 구간만 직접 라벨 |

## 반응형

- 모바일 390px에서 **가로 스크롤이 절대 생기면 안 된다.**
- 넓은 표·차트는 자기 컨테이너 안에서 `overflow-x: auto`.
- 탭 바는 모바일에서 가로 스크롤, 부제는 숨김.

## 인쇄

`@media print`에서 탭을 숨기고 모든 패널을 펼친다. 회의 자료를 PDF로 뽑는 경로다.
