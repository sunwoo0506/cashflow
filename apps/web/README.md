# web · 읽기 전용 화면 (로드맵 2단계)

탭 4개 · 전역 컨트롤 · URL 상태. 숫자는 전부 `cashflow-engine` 이 계산한다.

```bash
pnpm --filter web dev         # 개발 서버
pnpm --filter web test        # 화면 테스트 (숫자가 골든값과 같은지)
pnpm --filter web screenshot  # 라이트·다크·모바일 390px 스크린샷
```

## 구조

| 경로 | 무엇 |
|---|---|
| `lib/data.ts` | 픽스처를 읽어 도메인 모델로 준다. **3단계에서 이 파일만 Supabase 조회로 바꾼다** |
| `lib/store.tsx` | URL ↔ 화면 상태, 엔진 호출 |
| `lib/format.ts` | 금액 표기 (`△` 음수 · 억/만 보조) |
| `components/shell.tsx` | 전역 컨트롤 + 탭 셸 |
| `components/tabs/*` | 탭 4개 |
| `components/ui/` | Card · Tile · Badge · Seg · Verdict · StackBar |

## 상태는 URL 에 싣는다

회의 중 링크로 그대로 공유하기 위해서다.

```
?tab=in&corp=법인A&gran=month&w=5&rate=35&src=ar,won
```

기본값(오늘 탭 · 전체 법인 · 주간 · 100% · 확정채권+신규매출)은 쿼리에 넣지 않는다.
`w` 를 안 주면 **기준일이 속한 주**로 연다.

## 아직 안 한 것

- **인라인 편집** — 집행상태·허가상태·연기 주차 고르기는 4단계(쓰기)
- **허가상태 · 지출 성격 · 계정과목** — 제출 양식에서 받는 값이라 지금은 「미기재」로 둔다.
  이름으로 추측하지 않는다 (docs/02 §4.2)
- **탭 ⑤ 데이터·설정** — 업로드는 5단계
- `useSearchParams` 때문에 페이지 전체가 클라이언트 렌더다. 내부용 대시보드라 그대로 두었다
