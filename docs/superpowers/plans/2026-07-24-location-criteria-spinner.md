# 위치·추천 조건·공통 스피너 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위치 권한을 화면에서 다시 요청하고, 검색 반경과 Google 품질 기준을 조절하며, 모든 주요 비동기 UI에 일관된 스피너를 표시한다.

**Architecture:** 위치와 서버 검색 반경은 `SearchLocation`, 프론트엔드 추천 품질 기준은 `RecommendationCriteria`로 분리한다. `Map`이 두 설정을 각각 상위 페이지에 전달하고 `Recommend`가 품질 기준을 후보 필터에 적용한다. 스피너는 현재 글자색을 상속하는 표시 전용 공통 컴포넌트로 만들고 기존 mutation/loading 상태에 조합한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS Modules, TanStack Query, Vitest, Testing Library, Supabase Edge Functions, Deno

## Global Constraints

- 검색 반경 허용 값은 정확히 `100 | 300 | 500 | 1000`이고 기본값은 `500`이다.
- 최소 Google 평점 허용 값은 정확히 `3.5 | 4 | 4.5 | 5`이고 기본값은 `3.5`다.
- 최소 Google 리뷰 수 허용 값은 정확히 `10 | 30 | 50 | 70 | 100`이고 기본값은 `30`이다.
- Google 평점과 리뷰 수 조건은 AND로 적용하며 결측 평점은 제외한다.
- 위치 요청 옵션 `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 0`을 유지한다.
- Google Places API는 계속 Edge Function에서만 호출하고 사용자 ID + IP rate limit을 변경하지 않는다.
- 데이터베이스, RLS, RBAC, 구독 및 사용량 테이블 구조를 변경하지 않는다.
- 관련 없는 리팩터링이나 스타일 변경을 하지 않는다.

---

### Task 1: 추천 조건 타입과 후보 필터

**Files:**
- Modify: `lib/types/api/recommend.types.ts`
- Modify: `lib/recommend.ts`
- Test: `lib/recommend.test.ts`

**Interfaces:**
- Produces: `RecommendationCriteria` 타입
- Produces: `DEFAULT_RECOMMENDATION_CRITERIA` 상수
- Changes: `filterCandidates<T extends Candidate>(candidates, now, criteria): T[]`
- Consumes later: `Map`, `HomePage`, `Recommend`

- [ ] **Step 1: 후보 품질 필터의 실패 테스트 작성**

`lib/recommend.test.ts`에 기본값, 경계값 포함, 기준 미달, 결측 평점 테스트를 추가한다.

```ts
const criteria = { minGoogleRating: 3.5 as const, minGoogleReviews: 30 as const };

it('Google 평점과 리뷰 수가 최소 기준 이상인 후보만 포함합니다', () => {
  const candidates = [
    { ...base, placeId: 'boundary', googleRating: 3.5, googleRatingsTotal: 30 },
    { ...base, placeId: 'low-rating', googleRating: 3.49, googleRatingsTotal: 30 },
    { ...base, placeId: 'low-reviews', googleRating: 4, googleRatingsTotal: 29 },
    { ...base, placeId: 'missing-rating', googleRating: null, googleRatingsTotal: 100 },
  ];
  expect(filterCandidates(candidates, new Date(), criteria).map((x) => x.placeId)).toEqual([
    'boundary',
  ]);
});
```

기존 영구 제외/스누즈 테스트도 `criteria`를 세 번째 인자로 전달한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- --run lib/recommend.test.ts`

Expected: `filterCandidates`의 세 번째 인자 또는 품질 필터가 없어 FAIL

- [ ] **Step 3: 추천 조건 타입과 최소 필터 구현**

`lib/types/api/recommend.types.ts`에 다음 타입과 기본값을 추가한다.

```ts
export type MinimumGoogleRating = 3.5 | 4 | 4.5 | 5;
export type MinimumGoogleReviews = 10 | 30 | 50 | 70 | 100;
export type RecommendationCriteria = {
  minGoogleRating: MinimumGoogleRating;
  minGoogleReviews: MinimumGoogleReviews;
};
export const DEFAULT_RECOMMENDATION_CRITERIA: RecommendationCriteria = {
  minGoogleRating: 3.5,
  minGoogleReviews: 30,
};
```

`filterCandidates`에 `criteria: RecommendationCriteria`를 추가하고 기존 조건과 함께 다음을 검사한다.

```ts
c.googleRating !== null &&
  c.googleRating >= criteria.minGoogleRating &&
  c.googleRatingsTotal >= criteria.minGoogleReviews
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `npm test -- --run lib/recommend.test.ts`

Expected: PASS

- [ ] **Step 5: 타입과 필터 커밋**

```bash
git add lib/types/api/recommend.types.ts lib/recommend.ts lib/recommend.test.ts
git commit -m "feat: Google 평점과 리뷰 수 추천 조건 추가"
```

### Task 2: 검색 조건 UI와 위치 권한 재요청

**Files:**
- Modify: `components/Map.tsx`
- Modify: `components/Map.module.css`
- Test: `components/Map.test.tsx`
- Modify: `lib/messages.ts`
- Modify: `app/page.tsx`
- Test: `app/page.test.tsx`

**Interfaces:**
- Consumes: `RecommendationCriteria`, `DEFAULT_RECOMMENDATION_CRITERIA`
- Produces: `Map` prop `onCriteriaChange(value: RecommendationCriteria): void`
- Produces: `Recommend` prop `criteria: RecommendationCriteria`

- [ ] **Step 1: 네 반경과 추천 조건 UI 실패 테스트 작성**

`components/Map.test.tsx`의 검색 반경 테스트를 네 항목으로 바꾸고 다음 기대를 추가한다.

```ts
expect(screen.getByRole('option', { name: '100m' })).toBeInTheDocument();
expect(screen.getByRole('option', { name: '300m' })).toBeInTheDocument();
expect(screen.getByLabelText('최소 평점')).toHaveValue('3.5');
expect(screen.getByLabelText('최소 리뷰 수')).toHaveValue('30');
```

평점 옵션 `3.5, 4.0, 4.5, 5.0`과 리뷰 옵션 `10, 30, 50, 70, 100`을 확인하고, 두 select 변경 시 `onCriteriaChange`에 완전한 객체가 전달되는 테스트를 작성한다.

- [ ] **Step 2: 권한 재요청 실패 테스트 작성**

첫 호출은 실패하고 버튼 클릭 후 두 번째 호출은 성공하도록 mock한다.

```ts
const getCurrentPosition = vi
  .fn()
  .mockImplementationOnce((_success, error) => error())
  .mockImplementationOnce((success) =>
    success({ coords: { latitude: 37.5, longitude: 127 } }),
  );
```

`현재 위치 권한이 필요합니다.` 버튼 클릭 후 두 번째 호출, 위치 콜백, 경고 제거를 검증한다. `navigator.permissions.query`가 `{ state: 'denied' }`를 반환하거나 재요청이 실패하면 `브라우저 설정에서 위치 권한을 허용해 주세요.`가 표시되는 테스트도 추가한다.

- [ ] **Step 3: 새 테스트가 실패하는지 확인**

Run: `npm test -- --run components/Map.test.tsx app/page.test.tsx`

Expected: 새 props, 옵션, 버튼 동작이 없어 FAIL

- [ ] **Step 4: 위치 요청 함수와 검색 조건 UI 구현**

`lib/messages.ts`에 설정 안내 메시지를 추가한다.

```ts
GEOLOCATION_SETTINGS_REQUIRED: '브라우저 설정에서 위치 권한을 허용해 주세요.',
```

`Map`은 다음 prop을 받는다.

```ts
{
  onLocationChange: (value: SearchLocation) => void;
  onCriteriaChange: (value: RecommendationCriteria) => void;
}
```

반경 state를 `100 | 300 | 500 | 1000`으로 확장한다. 평점과 리뷰 select는 각각 명시된 유니온 값만 사용하고 기본값을 렌더한다. 위치 요청 로직은 `useCallback` 함수로 만들고 최초 effect와 경고 버튼에서 재사용한다. 재시도 여부와 요청 중 상태를 사용해 최초 실패 메시지와 설정 안내 메시지를 구분하며 Permissions API는 `denied` 보조 확인에만 사용한다.

`app/page.tsx`는 `DEFAULT_RECOMMENDATION_CRITERIA`로 상태를 초기화하고 `Map`과 `Recommend` 사이에 전달한다.

- [ ] **Step 5: 검색 조건과 권한 테스트 통과 확인**

Run: `npm test -- --run components/Map.test.tsx app/page.test.tsx`

Expected: PASS

- [ ] **Step 6: 검색 조건 UI 커밋**

```bash
git add components/Map.tsx components/Map.module.css components/Map.test.tsx lib/messages.ts app/page.tsx app/page.test.tsx
git commit -m "feat: 위치 재요청과 검색 조건 UI 추가"
```

### Task 3: 추천 실행에 품질 기준 연결

**Files:**
- Modify: `components/Recommend.tsx`
- Test: `components/Recommend.test.tsx`

**Interfaces:**
- Consumes: `RecommendationCriteria`
- Changes: `Recommend` props에 `criteria: RecommendationCriteria` 추가
- Consumes: Task 1의 `filterCandidates(candidates, now, criteria)`

- [ ] **Step 1: 추천 조건 연결 실패 테스트 작성**

`components/Recommend.test.tsx`의 기본 렌더 helper 또는 각 렌더에 기본 criteria를 전달한다. 평점 경계 미달, 리뷰 경계 미달, 두 기준을 만족하는 후보를 섞고 조건을 만족하는 식당만 표시되는 테스트를 추가한다.

```ts
const criteria = { minGoogleRating: 3.5 as const, minGoogleReviews: 30 as const };
```

기존 restaurant fixture의 `googleRatingsTotal`은 기본값 30 이상으로 바꿔 기존 테스트 의도를 유지한다.

- [ ] **Step 2: 새 테스트가 실패하는지 확인**

Run: `npm test -- --run components/Recommend.test.tsx`

Expected: `criteria` prop 또는 새 `filterCandidates` 호출이 연결되지 않아 FAIL

- [ ] **Step 3: 최소 연결 구현**

`Recommend`가 `criteria` prop을 받고 다음처럼 필터에 전달한다.

```ts
const candidates = filterCandidates(merged.candidates, new Date(), criteria).map(...)
```

- [ ] **Step 4: 추천 컴포넌트 테스트 통과 확인**

Run: `npm test -- --run components/Recommend.test.tsx lib/recommend.test.ts`

Expected: PASS

- [ ] **Step 5: 추천 조건 연결 커밋**

```bash
git add components/Recommend.tsx components/Recommend.test.tsx
git commit -m "feat: 추천 후보에 사용자 품질 기준 적용"
```

### Task 4: Edge Function 검색 반경 확장

**Files:**
- Modify: `supabase/functions/nearby/index.ts`
- Test: `supabase/functions/nearby/index.test.ts`

**Interfaces:**
- Changes: `nearby` 요청 허용 반경을 `[100, 300, 500, 1000]`으로 확장
- Preserves: JWT 인증과 사용자 ID + IP rate limit 선행 실행

- [ ] **Step 1: 반경 허용 목록 실패 테스트 작성**

100과 300 요청이 200을 반환하며 `findCached`에 해당 값이 전달되는 테이블 테스트를 추가한다. 200 또는 2000 요청은 400인 테스트도 추가한다.

- [ ] **Step 2: Edge Function 테스트 실패 확인**

Run: `cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto nearby/index.test.ts`

Expected: 100과 300 요청이 400으로 FAIL

- [ ] **Step 3: 서버 허용 목록 최소 변경**

`supabase/functions/nearby/index.ts`의 서버 측 검증을 다음과 같이 바꾼다.

```ts
![100, 300, 500, 1000].includes(body.radius)
```

rate limit과 외부 API 어댑터는 수정하지 않는다.

- [ ] **Step 4: Edge Function 테스트 통과 확인**

Run: `cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto nearby/index.test.ts`

Expected: PASS

- [ ] **Step 5: 서버 검증 커밋**

```bash
git add supabase/functions/nearby/index.ts supabase/functions/nearby/index.test.ts
git commit -m "feat: 주변 검색 반경에 100m와 300m 추가"
```

### Task 5: 공통 Spinner와 핵심 추천 UI 적용

**Files:**
- Create: `components/Spinner.tsx`
- Create: `components/Spinner.module.css`
- Create: `components/Spinner.test.tsx`
- Modify: `components/Recommend.tsx`
- Modify: `components/Recommend.module.css`
- Modify: `components/Map.tsx`
- Modify: `components/Map.module.css`
- Test: `components/Recommend.test.tsx`
- Test: `components/Map.test.tsx`

**Interfaces:**
- Produces: `Spinner({ className?: string }): JSX.Element`
- Consumes: `isFetching`, 위치 요청 pending 상태

- [ ] **Step 1: 공통 스피너 실패 테스트 작성**

`Spinner.test.tsx`에서 `data-testid="spinner"` 요소가 `aria-hidden="true"`인지 확인한다. 추천 pending 테스트에는 버튼 안의 스피너와 `추천 중…` 문구, 완료 후 제거를 검증한다. 위치 재요청 테스트에는 pending promise 동안 버튼 비활성화, `aria-busy`, 스피너 표시를 검증한다.

- [ ] **Step 2: 스피너 테스트 실패 확인**

Run: `npm test -- --run components/Spinner.test.tsx components/Recommend.test.tsx components/Map.test.tsx`

Expected: Spinner 모듈이 없어 FAIL

- [ ] **Step 3: 공통 스피너 최소 구현**

`Spinner.tsx`는 장식용 span만 렌더한다.

```tsx
export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`${styles.spinner} ${className}`.trim()}
      data-testid="spinner"
      aria-hidden="true"
    />
  );
}
```

CSS는 16px 정사각형, `currentColor` 테두리, 한쪽 투명 테두리, 0.7초 선형 회전을 사용한다. `prefers-reduced-motion: reduce`에서 `animation: none`을 적용한다.

- [ ] **Step 4: 추천과 위치 버튼에 스피너 조합**

추천 버튼에는 `isFetching`일 때 `<Spinner /> 추천 중…`을 표시한다. 위치 경고 버튼에는 요청 중 `<Spinner /> 위치 확인 중…`을 표시한다. 버튼 내부 정렬은 기존 크기를 유지하도록 `inline-flex`, 중앙 정렬, 작은 gap만 추가한다.

- [ ] **Step 5: 핵심 스피너 테스트 통과 확인**

Run: `npm test -- --run components/Spinner.test.tsx components/Recommend.test.tsx components/Map.test.tsx`

Expected: PASS

- [ ] **Step 6: 공통 스피너 핵심 적용 커밋**

```bash
git add components/Spinner.tsx components/Spinner.module.css components/Spinner.test.tsx components/Recommend.tsx components/Recommend.module.css components/Recommend.test.tsx components/Map.tsx components/Map.module.css components/Map.test.tsx
git commit -m "feat: 공통 스피너를 추천과 위치 요청에 적용"
```

### Task 6: 나머지 비동기 UI에 공통 스피너 적용

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/page.module.css`
- Modify: `app/page.test.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/login/login.module.css`
- Modify: `app/login/page.test.tsx`
- Modify: `app/set-password/page.tsx`
- Modify: `app/set-password/page.test.tsx`
- Modify: `app/admin/approve/page.tsx`
- Modify: `app/admin/approve/page.test.tsx`
- Modify: `components/GroupManager.tsx`
- Modify: `components/GroupManager.module.css`
- Modify: `components/GroupManager.test.tsx`
- Modify: `components/RatingControls.tsx`
- Modify: `components/RatingControls.module.css`
- Modify: `components/RatingControls.test.tsx`
- Modify: `components/CategoryPrefs.tsx`
- Modify: `components/CategoryPrefs.module.css`
- Modify: `components/CategoryPrefs.test.tsx`

**Interfaces:**
- Consumes: `Spinner`
- Preserves: 각 mutation의 기존 disabled 및 오류 처리

- [ ] **Step 1: 주요 pending UI 실패 테스트 작성**

각 테스트 파일에서 해당 mutation promise를 보류하고 다음을 검증한다.

- 로그아웃: `로그아웃 중…`과 스피너
- 로그인: `로그인 중…`과 스피너
- 가입 요청: `요청 중…`과 스피너
- 비밀번호 설정: `설정 중…`과 스피너
- 그룹: 실행한 생성 또는 가입 버튼에만 스피너
- 평점: 선택한 별점 또는 실행한 스누즈/제외 영역에 스피너 하나
- 카테고리 선호: 선택 영역에 스피너 하나
- 관리자: 최초 조회와 실행한 승인 또는 거절에 스피너

모든 pending 컨테이너 또는 버튼에 `aria-busy="true"`가 있는지도 함께 확인한다.

- [ ] **Step 2: 관련 테스트가 실패하는지 확인**

Run: `npm test -- --run app/page.test.tsx app/login/page.test.tsx app/set-password/page.test.tsx app/admin/approve/page.test.tsx components/GroupManager.test.tsx components/RatingControls.test.tsx components/CategoryPrefs.test.tsx`

Expected: 공통 스피너가 없어 새 assertion이 FAIL

- [ ] **Step 3: 기존 mutation 상태에 Spinner 조합**

각 컴포넌트에 `Spinner`를 import한다. 텍스트 버튼은 pending일 때 `Spinner`와 진행 중 문구를 함께 렌더한다. `RatingControls`는 마지막 실행 액션을 local state로 추적해 관련 버튼 또는 컨트롤 영역 한 곳에만 표시하고 settled 후 초기화한다. `CategoryPrefs`는 fieldset legend 옆 상태 영역에 하나만 표시한다. 관리자 최초 조회는 기존 확인 문구 앞에 스피너를 둔다.

기존 버튼 색상, 높이, 모서리, 오류 문구는 유지하고 필요한 `inline-flex`, `gap`, 정렬 속성만 각 CSS Module에 추가한다.

- [ ] **Step 4: 전체 비동기 UI 테스트 통과 확인**

Run: `npm test -- --run app/page.test.tsx app/login/page.test.tsx app/set-password/page.test.tsx app/admin/approve/page.test.tsx components/GroupManager.test.tsx components/RatingControls.test.tsx components/CategoryPrefs.test.tsx`

Expected: PASS

- [ ] **Step 5: 공통 스피너 전체 적용 커밋**

```bash
git add app components
git commit -m "feat: 비동기 UI에 공통 스피너 적용"
```

### Task 7: 문서와 전체 검증

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents: 최종 검색 반경, 품질 조건, 위치 권한 재요청, 공통 스피너

- [ ] **Step 1: README 기능 설명 갱신**

추천 섹션의 반경 설명을 `100m, 300m, 500m 또는 1km`로 바꾼다. 최소 Google 평점과 리뷰 수를 사용자가 선택하며 두 기준을 만족하는 후보만 추천한다는 문장을 추가한다. 위치 섹션에는 실패 경고를 눌러 권한을 다시 요청하고 영구 차단 시 브라우저 설정을 안내한다는 내용을 추가한다.

- [ ] **Step 2: 전체 프론트엔드 검증**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run format:check`

Expected: 모두 exit 0

- [ ] **Step 3: 전체 Edge Function 검증**

Run: `cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto`

Expected: 모두 PASS

- [ ] **Step 4: 변경 범위와 보안 불변 조건 확인**

Run: `git diff --check && git status -sb && git diff origin/main...HEAD --stat`

Expected: 위치·추천 조건·스피너·관련 문서/테스트만 변경됨. DB/RLS/RBAC/rate limit/API 키 경로 변경 없음

- [ ] **Step 5: 문서 커밋**

```bash
git add README.md
git commit -m "docs: 위치와 추천 조건 개선 내용 반영"
```
