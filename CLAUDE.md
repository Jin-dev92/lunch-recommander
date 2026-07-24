# lunch-recommender — 프로젝트 규칙

> llm-wiki `rules/` 조각을 조합해 생성. 원본 수정은 위키에서 하고 `/wiki-apply`로 재생성한다.
> 스택: Next.js 15 (App Router) + React 19 + TypeScript + Supabase + Vitest.

---

<!-- from rules/stacks/nextjs.md -->

# Next.js (App Router) Development Rules

> Next.js App Router + React Server Components 기반 FE 개발 규칙.
> Vite/CRA가 아니므로 `import.meta.env`·CSR 전용 패턴을 그대로 가져오지 않는다.

## 버전 주의

- 이 레포의 Next.js는 학습 데이터와 다를 수 있다. **API/관례/파일구조 변경 가능** —
  코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 읽고 deprecation을 확인한다.
- 버전별 세부 API(시그니처·옵션)는 **추측하지 말고 docs로 확인**한다.

## 파일/구조 규칙

- `.ts` / `.tsx`**만** 허용. `.js` / `.jsx` 신규 생성 금지 ❌
- 라우팅은 `app/` 디렉토리(App Router) 규칙을 따른다 — `page.tsx`, `layout.tsx`,
  `route.ts`(Route Handler), `loading.tsx`, `error.tsx` 등 파일 컨벤션 사용.
- 함수형 컴포넌트만 사용(클래스 컴포넌트 금지).

## Server / Client Component 경계

- **기본은 Server Component**. `"use client"`는 상호작용(상태·이벤트·브라우저 API)이
  실제로 필요한 컴포넌트에만 **최소 범위**로 선언한다.
- `"use client"`를 트리 상단에 무분별하게 붙이지 않는다 — 클라이언트 번들 비대화 방지.
- 클라이언트 전용 코드(브라우저 API, 이벤트 핸들러)는 Server Component에 두지 않는다.

## 데이터 페칭 / 뮤테이션

- 읽기 데이터는 **Server Component에서 `fetch`/직접 호출**로 가져오는 것을 우선한다.
  단순 조회에 클라이언트 페칭 라이브러리를 기본값으로 끌어들이지 않는다.
- 쓰기(뮤테이션)는 **Server Action** 또는 **Route Handler(`route.ts`)**를 통한다.
  정확한 시그니처/관례는 docs 확인 후 사용.
- 외부/백엔드 API 호출 로직을 컴포넌트 JSX 안에 인라인으로 흩뿌리지 않는다 —
  `lib/`(혹은 `app/_lib`) 등 데이터 레이어로 분리해 재사용한다.

## 환경변수 (보안)

- **`NEXT_PUBLIC_` prefix가 붙은 변수는 클라이언트 번들에 그대로 노출**된다.
  AI/Stripe/이메일/클라우드 등 **민감 키를 `NEXT_PUBLIC_`에 절대 넣지 않는다** ❌
- 민감 키는 prefix 없는 서버 전용 환경변수로 두고, Server Component / Route Handler /
  Server Action 등 **서버 측에서만** 사용한다.
- 민감한 외부 API는 클라이언트에서 직접 호출하지 않고 서버 측을 경유한다.

## 내장 기능 우선

- 이미지는 `next/image`, 내부 이동은 `next/link`, 폰트는 `next/font`를 사용한다
  (`<img>`/`<a>`/`<link rel=font>` 직접 사용 지양).
- `<head>` 직접 조작 대신 **Metadata API**(`metadata` export / `generateMetadata`)를 사용한다.

## TypeScript

- 공통 TS 규칙은 아래 "TypeScript 타입 규칙" 섹션을 따른다
  (`as any` 금지, index signature 금지, `enum`→`as const` 객체 패턴 등).

---

<!-- from rules/stacks/react.md -->

# React 베이스 규칙

- 함수형 컴포넌트만 사용

---

<!-- from rules/stacks/frontend.md -->

# Frontend Development Rules

> 원본은 React Query v5 + Zustand + Axios 기준 팀 룰이다.
> **이 프로젝트에는 해당 라이브러리가 설치되어 있지 않다.** 아래 규칙 중
> React Query / Zustand / Axios를 전제한 섹션은 **해당 도구를 도입할 때** 적용한다.
> TypeScript 타입 규칙, Enum 규칙, 매직 스트링 규칙, 파일 확장자 규칙은 지금 바로 적용된다.

## 파일 구조 규칙

### 파일 확장자

- `.ts` / `.tsx` **만 허용**
- `.js` / `.jsx` **신규 생성 금지** ❌

### API 레이어 4파일 세트 의무화 _(React Query 도입 시)_

새 도메인 작업 시 아래 4개 파일을 **반드시** 함께 생성한다.

```
src/api/{domain}.ts                              ← API 함수
src/types/api/{domain}.types.ts                  ← 타입 정의
src/hooks/queries/use{Domain}Queries.ts          ← Query hooks
src/hooks/mutations/use{Domain}Mutations.ts      ← Mutation hooks
```

각 디렉토리의 `index.ts`에 barrel export 추가 필수.

> 빠른 생성: `/add-api-domain {도메인명}` 스킬 사용

---

## 컴포넌트 규칙

- 컴포넌트 내 `axiosInstance` **직접 호출 금지** ❌
- 컴포넌트는 hook을 **소비**하기만 함 (API 호출 로직 포함 금지)

```typescript
// ❌ FORBIDDEN — 컴포넌트에서 직접 호출
const MyComponent = () => {
  const handleClick = async () => {
    const res = await axiosInstance.post('/api/orders', data); // ❌
  };
};

// ✅ GOOD — hook을 소비
const MyComponent = () => {
  const { mutate: createOrder } = useCreateOrder();
  const handleClick = () => createOrder(data);
};
```

---

## QueryKey 패턴 _(React Query 도입 시)_

```typescript
// ✅ 올바른 패턴
export const orderQueryKeys = {
  all: ['order'] as const,
  list: () => ['order', '/api/orders'] as const,
  byId: (orderId: string) => ['order', '/api/order', orderId] as const,
  byCustomer: (customerId: number) => ['order', '/api/order', customerId] as const,
};
```

**규칙:**

- `{domain}QueryKeys` 객체로 정의 (파일 상단)
- `all: ["domain"] as const` **필수** — 전체 무효화용
- 모든 key에 `as const` **필수**
- 첫 번째 요소는 항상 **도메인명 문자열**

---

## Query Hook 패턴 _(React Query 도입 시)_

```typescript
// ✅ 올바른 패턴
export const useGetOrderById = (
  orderId: string | null | undefined,
  options?: Partial<UseQueryOptions<OrderResponse>>,
) =>
  useQuery<OrderResponse>({
    queryKey: orderQueryKeys.byId(orderId ?? ''),
    queryFn: () => getOrderById(orderId!).then((res) => res.data),
    enabled: !!orderId,
    ...options,
  });
```

**규칙:**

- 파라미터는 `string | null | undefined` 허용 (nullable 허용)
- 필수 파라미터 있을 때 `enabled`로 null 체크 **필수**
- `.then(res => res.data)`로 axios 응답에서 data만 추출

### staleTime 가이드

| 값              | 적용 대상             |
| --------------- | --------------------- |
| `0` (default)   | 실시간성 필요 데이터  |
| `1000 * 30`     | 자주 변하지 않는 목록 |
| `1000 * 60 * 5` | 정적 코드 테이블      |

---

## Mutation Hook 패턴 _(React Query 도입 시)_

```typescript
// ✅ 올바른 패턴 — onSuccess는 invalidate만
export const useCreateOrder = (
  options?: UseMutationOptions<OrderResponse, Error, CreateOrderRequest>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateOrderRequest) => createOrder(req).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
    },
    ...options,
  });
};
```

**규칙:**

- `onSuccess`는 `invalidateQueries`**만** — toast/alert/snackbar **금지** ❌
- UI 피드백은 소비 컴포넌트의 `onSuccess` 또는 `useEffect`에서 처리
- 이중 invalidation 금지 (hook + 컴포넌트 양쪽에서 동시에) ❌

```typescript
// ❌ FORBIDDEN — hook에서 UI 피드백
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
  enqueueSnackbar("완료"); // ❌ 금지
},

// ✅ GOOD — 소비 컴포넌트에서 UI 처리
const { mutate } = useCreateOrder({
  onSuccess: () => enqueueSnackbar("주문이 생성되었습니다."),
});
```

---

## React Query v5 패턴 _(React Query 도입 시)_

### deprecated 패턴 사용 금지

`useQuery` / `useMutation` 옵션의 `onSuccess` / `onError` 콜백은 **v5에서 deprecated**.

```typescript
// ❌ FORBIDDEN — v5 deprecated
useQuery({
  queryKey: [...],
  queryFn: fetchData,
  onSuccess: (data) => { ... }, // ❌ deprecated
  onError: (err) => { ... },    // ❌ deprecated
});

// ✅ GOOD — useEffect로 처리하거나 컴포넌트 옵션으로 전달
const { data, isSuccess } = useGetOrders();
useEffect(() => {
  if (isSuccess) { ... }
}, [isSuccess]);
```

### isSaving 수동 boolean state 금지

```typescript
// ❌ FORBIDDEN
const [isSaving, setIsSaving] = useState(false);

// ✅ GOOD
const { mutate, isPending } = useCreateOrder();
```

---

## TypeScript 타입 규칙

### index signature 금지

```typescript
// ❌ FORBIDDEN — 필드가 명확히 정의된 경우
interface OrderFilter {
  [key: string]: any; // ❌
}

// ✅ GOOD — 명확한 필드 정의
interface OrderFilter {
  customerId?: number;
  status?: OrderStatus;
}
```

### `as any` 금지

```typescript
// ❌ FORBIDDEN
const data = response as any;

// 불가피한 경우 — 사유 주석 필수
const data = response as any; // TODO: API 응답 타입 정의 후 제거 예정
```

### API 함수 제네릭 타입 명시 필수

```typescript
// ✅ GOOD
axiosInstance.get<OrderResponse>('/api/orders');
axiosInstance.post<CreateOrderResponse, CreateOrderRequest>('/api/orders', req);

// ❌ FORBIDDEN — 제네릭 없음
axiosInstance.get('/api/orders');
```

### 타입 파일 작성

- OpenAPI 스펙 또는 실제 사용 코드 기반으로 작성
- 출처 주석 필수

```typescript
// @see OpenAPI spec: POST /api/orders
export interface CreateOrderRequest {
  customerId: number;
  items: OrderItem[];
}
```

---

## Store 규칙 (Zustand vs React Query) _(도입 시)_

| 상태 유형                      | 도구        |
| ------------------------------ | ----------- |
| **서버 상태** (API 응답, CRUD) | React Query |
| **클라이언트 상태** (UI, 로컬) | Zustand     |

- 서버 상태를 Zustand에 캐싱 **금지** ❌
- DevTools는 **반드시** `getDevtoolsConfig()`로 조건부 활성화 (개발 환경에서만)

```typescript
// ✅ GOOD — DevTools 조건부 활성화
create(devtools((set) => ({ ... }), getDevtoolsConfig("storeName")));

// ❌ FORBIDDEN — 항상 활성화
create(devtools((set) => ({ ... }), { name: "storeName" }));
```

---

## 금지 패턴 요약

| 패턴                                   | 대안                             |
| -------------------------------------- | -------------------------------- |
| 컴포넌트에서 `axiosInstance` 직접 호출 | API 함수 + hook 사용             |
| `[key: string]: any` index signature   | 명확한 필드 정의                 |
| `as any` (사유 없이)                   | 올바른 타입 정의                 |
| API 함수 제네릭 생략                   | `axiosInstance.get<T>(url)`      |
| `.js` / `.jsx` 신규 파일               | `.ts` / `.tsx` 사용              |
| useQuery `onSuccess` / `onError` 옵션  | `useEffect` 또는 컴포넌트 옵션   |
| `isSaving` 수동 boolean                | `mutation.isPending`             |
| mutation hook에서 toast/alert          | 소비 컴포넌트에서 처리           |
| 이중 invalidateQueries                 | hook 또는 컴포넌트 한 곳에서만   |
| 서버 상태를 Zustand에 저장             | React Query로 관리               |
| `enum` / `const enum` 사용             | `as const` 객체 + 타입 추출 패턴 |

---

## Enum 규칙

`enum` / `const enum` 사용 금지. `as const` 객체 + 타입 추출 패턴을 사용합니다.

```typescript
// ✅ GOOD
export const OrderStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// ❌ FORBIDDEN
enum OrderStatus {
  PENDING,
  COMPLETED,
  CANCELLED,
}
const enum OrderStatus {
  PENDING = 'PENDING',
}
```

**이유:**

- `enum`은 IIFE로 컴파일 → 번들러의 트리쉐이킹 대상에서 제외될 수 있음 (클라이언트 번들에서 실질적 영향)
- `const enum`은 `isolatedModules: true` 환경에서 동작 불가
- `as const`는 순수 객체 리터럴 → 번들러가 사이드 이펙트 없음을 확신하고 제거 가능

---

## 추가 FE 규칙

### Boolean 비교 — strict equality

```js
// ✅ GOOD
area?.use_xxx_yn === true;

// ❌ BAD (FORBIDDEN) — BE는 boolean → true/false 직렬화
area?.use_xxx_yn === '1';
area?.use_xxx_yn === 1;
```

### useEffect deps — 객체 전체 포함 금지

```js
// ❌ BAD — 참조 변경마다 재실행 → 무한 루프 위험
useEffect(() => { ... }, [fetchedCustomer, customer]);

// ✅ GOOD — 원시값(id)만 사용
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { ... }, [fetchedCustomer?.id, customer?.id]);
```

### API 응답 필드 타입 가드

API 응답 필드는 `number | string` 가능 → `.trim()` 직접 호출 금지.

```js
// ❌ BAD
field.trim();

// ✅ GOOD
String(field ?? '').trim();
```

---

## 매직 스트링 / 상수 단일 출처 (No Magic Strings)

의미 있거나 반복되는 문자열 리터럴(쿠키·스토리지 키, 역할, 내부 API 경로 등)을
코드 곳곳에 직접 쓰지 않는다. 단일 출처 상수 파일에 모아 import해서 쓴다.

- **식별자**(결합용 문자열: 쿠키명·스토리지 키·역할·내부 API 경로)는 `lib/constants.ts`로
  모은다. 예: `SESSION_COOKIE`, `ROLE`, `API_ROUTES`.
- **사용자 노출 문구**(에러·안내 메시지)는 `lib/messages.ts`(`MESSAGES`)에 둔다.
  식별자와 카피를 한 파일에 섞지 않는다.
- 값이 정해진 닫힌 집합(역할 등)은 `as const` 객체 + 파생 유니온 타입으로 정의해
  타입 안전성 확보. 예: `ROLE`, `SignupRole`. (→ 위 "Enum 규칙"과 동일 패턴)
- 같은 문자열이 2곳 이상 쓰이면 즉시 상수로 추출(DRY). 리뷰 시 새 매직 스트링이 보이면
  상수화부터 요구한다.
- 같은 상황의 메시지는 `MESSAGES` 한 곳에서만 정의해 문구 불일치·중복 방지.
  다국어 필요 시 `MESSAGES`를 i18n 카탈로그로 승격.
