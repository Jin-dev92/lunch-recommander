# 프론트엔드 데이터 레이어 후속 리팩터링 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/set-password`와 `app/admin/approve`의 직접 Supabase 호출을 기존 API 함수와 React Query 훅 계층으로 옮기면서 사용자 동작을 그대로 보존한다.

**Architecture:** 페이지는 React Query 훅만 호출하고, 훅은 `lib/api` 함수만 호출한다. 비밀번호 설정은 기존 `auth` 도메인에 추가하고, 관리자 승인은 수명주기와 타입이 다른 `signupApproval` 도메인으로 분리한다.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS, TanStack React Query, Vitest, Testing Library

## Global Constraints

- UI, 사용자 문구, 화면 이동, 로딩 및 중복 제출 방지 동작을 변경하지 않는다.
- Supabase Edge Function 계약, 데이터베이스 스키마, RLS, RBAC를 변경하지 않는다.
- SMTP, `AdvancedMarkerElement`, `@supabase/ssr` 작업은 포함하지 않는다.
- 관리자 권한 검증은 기존 `approve-signup` Edge Function에 유지하며 프론트엔드를 보안 경계로 취급하지 않는다.
- README의 후속 개선 두 번째 항목만 완료 처리한다.
- 구현은 테스트 실패를 먼저 확인하고 최소 코드로 통과시키는 순서로 진행한다.

---

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `lib/types/api/auth.types.ts` | 비밀번호 변경 요청 타입 |
| `lib/types/api/signupApproval.types.ts` | 관리자 승인 조회·결정 요청과 응답 타입 |
| `lib/api/auth.ts` | 초대 세션 판정과 비밀번호 변경 |
| `lib/api/signupApproval.ts` | `approve-signup` Edge Function 호출 |
| `lib/hooks/queries/useAuthQueries.ts` | 초대 세션 유효성 쿼리 |
| `lib/hooks/queries/useSignupApprovalQueries.ts` | 토큰별 승인 요청 조회 쿼리 |
| `lib/hooks/mutations/useAuthMutations.ts` | 비밀번호 변경 뮤테이션 |
| `lib/hooks/mutations/useSignupApprovalMutations.ts` | 승인·거절 결정 뮤테이션 |
| `app/set-password/page.tsx` | 비밀번호 설정 화면과 성공 후 이동 |
| `app/admin/approve/page.tsx` | 승인 정보 및 결정 결과 표시 |

### Task 1: API 함수와 타입 경계 추가

**Files:**
- Create: `lib/api/auth.test.ts`
- Create: `lib/api/signupApproval.ts`
- Create: `lib/api/signupApproval.test.ts`
- Create: `lib/types/api/signupApproval.types.ts`
- Modify: `lib/api/auth.ts`
- Modify: `lib/api/index.ts`
- Modify: `lib/types/api/auth.types.ts`
- Modify: `lib/types/api/index.ts`

**Interfaces:**
- Produces: `hasInviteSession(): Promise<boolean>`
- Produces: `updatePassword({ password }: UpdatePasswordRequest): Promise<void>`
- Produces: `getSignupApproval(token: string): Promise<SignupApprovalRequest>`
- Produces: `decideSignupApproval(request: SignupApprovalDecisionRequest): Promise<SignupApprovalDecisionResponse>`
- Produces: `SignupApprovalAction = 'approve' | 'reject'`

- [ ] **Step 1: 인증 API의 실패 테스트 작성**

`lib/api/auth.test.ts`에서 Supabase를 모킹하고 아래 계약을 검증한다.

```ts
it('비익명 세션만 초대 세션으로 인정한다', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });
  await expect(hasInviteSession()).resolves.toBe(true);
});

it('익명 세션은 초대 세션으로 인정하지 않는다', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
  await expect(hasInviteSession()).resolves.toBe(false);
});

it('비밀번호 변경 오류를 예외로 승격한다', async () => {
  updateUser.mockResolvedValue({ error: { message: '변경 실패' } });
  await expect(updatePassword({ password: 'strong-password-1' })).rejects.toThrow('변경 실패');
});
```

- [ ] **Step 2: 인증 API 테스트가 실패하는지 확인**

Run: `npx vitest run lib/api/auth.test.ts`

Expected: `hasInviteSession`과 `updatePassword`가 export되지 않아 FAIL

- [ ] **Step 3: 인증 타입과 API 최소 구현**

`lib/types/api/auth.types.ts`:

```ts
export type UpdatePasswordRequest = {
  password: string;
};
```

`lib/api/auth.ts`:

```ts
export async function hasInviteSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return Boolean(data.session) && !data.session?.user.is_anonymous;
}

export async function updatePassword({ password }: UpdatePasswordRequest): Promise<void> {
  assertNoError(await supabase.auth.updateUser({ password }));
}
```

- [ ] **Step 4: 인증 API 테스트 통과 확인**

Run: `npx vitest run lib/api/auth.test.ts`

Expected: PASS

- [ ] **Step 5: 관리자 승인 API의 실패 테스트 작성**

`lib/api/signupApproval.test.ts`에서 `supabase.functions.invoke`를 모킹한다.

```ts
it('토큰으로 승인 요청 정보를 조회한다', async () => {
  invoke.mockResolvedValue({
    data: { email: 'guest@example.com', status: 'pending' },
    error: null,
  });
  await expect(getSignupApproval('token-1')).resolves.toEqual({
    email: 'guest@example.com',
    status: 'pending',
  });
  expect(invoke).toHaveBeenCalledWith('approve-signup', {
    body: { token: 'token-1', action: 'info' },
  });
});

it('승인 결정 오류를 예외로 승격한다', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: '승인 실패' } });
  await expect(
    decideSignupApproval({ token: 'token-1', action: 'approve' }),
  ).rejects.toThrow('승인 실패');
});
```

- [ ] **Step 6: 관리자 승인 API 테스트가 실패하는지 확인**

Run: `npx vitest run lib/api/signupApproval.test.ts`

Expected: API 모듈이 없어 FAIL

- [ ] **Step 7: 관리자 승인 타입과 API 최소 구현**

`lib/types/api/signupApproval.types.ts`:

```ts
export type SignupApprovalRequest = {
  email: string;
  status: string;
};

export type SignupApprovalAction = 'approve' | 'reject';

export type SignupApprovalDecisionRequest = {
  token: string;
  action: SignupApprovalAction;
};

export type SignupApprovalDecisionResponse = {
  alreadyRegistered?: boolean;
};
```

`lib/api/signupApproval.ts`는 `supabase.functions.invoke`를 호출하고 `unwrap`으로 오류를
예외로 승격한다. 조회 액션은 `'info'`, 결정 액션은 요청의 `action`을 전달한다.
`lib/api/index.ts`와 `lib/types/api/index.ts`에서 새 export를 노출한다.

- [ ] **Step 8: API 계층 테스트 통과 확인**

Run: `npx vitest run lib/api/auth.test.ts lib/api/signupApproval.test.ts`

Expected: PASS

- [ ] **Step 9: API 계층 커밋**

```bash
git add lib/api lib/types/api
git commit -m "refactor: 인증과 승인 API 경계 추가"
```

### Task 2: 비밀번호 설정 페이지를 React Query로 전환

**Files:**
- Create: `lib/hooks/queries/useAuthQueries.ts`
- Modify: `lib/hooks/queries/index.ts`
- Modify: `lib/hooks/mutations/useAuthMutations.ts`
- Modify: `app/set-password/page.tsx`
- Modify: `app/set-password/page.test.tsx`

**Interfaces:**
- Consumes: `hasInviteSession(): Promise<boolean>`
- Consumes: `updatePassword(request: UpdatePasswordRequest): Promise<void>`
- Produces: `useInviteSession()`
- Produces: `useUpdatePassword()`

- [ ] **Step 1: 페이지 테스트를 훅 경계 기준으로 변경하고 실패 확인**

Supabase 모킹을 제거하고 아래 훅을 모킹한다.

```ts
vi.mock('../../lib/hooks/queries', () => ({
  useInviteSession: vi.fn(),
}));

vi.mock('../../lib/hooks/mutations', () => ({
  useUpdatePassword: vi.fn(),
}));
```

기존 11개 사용자 관점 어설션은 유지한다. 세션 조회의 pending, success, error와 비밀번호
변경의 pending, success, error 상태를 모킹해 기존 문구·스피너·이동·중복 제출을 검증한다.

Run: `npx vitest run app/set-password/page.test.tsx`

Expected: 새 훅이 없어 FAIL

- [ ] **Step 2: 인증 쿼리와 뮤테이션 훅 구현**

`lib/hooks/queries/useAuthQueries.ts`:

```ts
export const authQueryKeys = {
  inviteSession: ['auth', 'invite-session'] as const,
};

export const useInviteSession = () =>
  useQuery({
    queryKey: authQueryKeys.inviteSession,
    queryFn: hasInviteSession,
    retry: false,
  });
```

`lib/hooks/mutations/useAuthMutations.ts`:

```ts
export const useUpdatePassword = (
  options?: UseMutationOptions<void, Error, UpdatePasswordRequest>,
) =>
  useMutation({
    mutationFn: (request: UpdatePasswordRequest) => updatePassword(request),
    ...options,
  });
```

쿼리 및 뮤테이션 배럴 파일에서 새 훅을 export한다.

- [ ] **Step 3: 페이지에서 직접 Supabase 호출 제거**

`app/set-password/page.tsx`는 `useInviteSession`과 `useUpdatePassword`를 사용한다.

- 쿼리 pending: 기존 `초대 정보를 확인하는 중입니다.` 표시
- 쿼리 error: 기존 초대 정보 확인 실패 문구 표시
- 쿼리 data가 false: 유효한 초대 링크 안내
- 제출: `mutate({ password }, { onSuccess })`
- 성공 후 메시지를 표시하고 `location.assign(ROUTES.HOME)` 실행
- `isPending || isSuccess`일 때 버튼 비활성화
- mutation 오류는 Supabase 오류 메시지를 우선 표시하고, 비-`Error` 값에는 기존 대체 문구 사용

- [ ] **Step 4: 비밀번호 설정 테스트 통과 확인**

Run: `npx vitest run app/set-password/page.test.tsx lib/api/auth.test.ts`

Expected: PASS

- [ ] **Step 5: 비밀번호 설정 전환 커밋**

```bash
git add app/set-password lib/hooks/queries/useAuthQueries.ts lib/hooks/queries/index.ts lib/hooks/mutations/useAuthMutations.ts
git commit -m "refactor: 비밀번호 설정을 데이터 레이어로 이동"
```

### Task 3: 관리자 승인 페이지를 React Query로 전환

**Files:**
- Create: `lib/hooks/queries/useSignupApprovalQueries.ts`
- Create: `lib/hooks/mutations/useSignupApprovalMutations.ts`
- Modify: `lib/hooks/queries/index.ts`
- Modify: `lib/hooks/mutations/index.ts`
- Modify: `app/admin/approve/page.tsx`
- Modify: `app/admin/approve/page.test.tsx`

**Interfaces:**
- Consumes: `getSignupApproval(token: string): Promise<SignupApprovalRequest>`
- Consumes: `decideSignupApproval(request: SignupApprovalDecisionRequest): Promise<SignupApprovalDecisionResponse>`
- Produces: `useSignupApproval(token: string)`
- Produces: `useDecideSignupApproval()`

- [ ] **Step 1: 페이지 테스트를 훅 경계 기준으로 변경하고 실패 확인**

Supabase 모킹을 제거하고 조회·결정 훅을 모킹한다.

```ts
vi.mock('../../../lib/hooks/queries', () => ({
  useSignupApproval: vi.fn(),
}));

vi.mock('../../../lib/hooks/mutations', () => ({
  useDecideSignupApproval: vi.fn(),
}));
```

기존 5개 사용자 관점 어설션은 유지하고, 결정 함수가
`{ token: 'token-1', action: 'approve' | 'reject' }`를 받는지 검증한다.

Run: `npx vitest run app/admin/approve/page.test.tsx`

Expected: 새 훅이 없어 FAIL

- [ ] **Step 2: 관리자 승인 쿼리와 뮤테이션 훅 구현**

`lib/hooks/queries/useSignupApprovalQueries.ts`:

```ts
export const signupApprovalQueryKeys = {
  all: ['signup-approval'] as const,
  detail: (token: string) => [...signupApprovalQueryKeys.all, token] as const,
};

export const useSignupApproval = (token: string) =>
  useQuery({
    queryKey: signupApprovalQueryKeys.detail(token),
    queryFn: () => getSignupApproval(token),
    retry: false,
  });
```

`lib/hooks/mutations/useSignupApprovalMutations.ts`:

```ts
export const useDecideSignupApproval = (
  options?: UseMutationOptions<
    SignupApprovalDecisionResponse,
    Error,
    SignupApprovalDecisionRequest
  >,
) =>
  useMutation({
    mutationFn: decideSignupApproval,
    ...options,
  });
```

두 배럴 파일에서 새 훅을 export한다.

- [ ] **Step 3: 페이지에서 직접 Supabase 호출 제거**

`app/admin/approve/page.tsx`는 조회 쿼리의 `data`, `error`, `isPending`과 결정 뮤테이션의
`mutate`, `isPending`, `isSuccess`를 사용한다.

- 조회 pending: 기존 공통 스피너와 문구 표시
- 조회 성공: 이메일과 상태 표시
- 결정 pending: 기존 공통 스피너와 문구 표시, 두 버튼 비활성화
- 결정 성공: `alreadyRegistered`와 액션에 따라 기존 결과 문구 표시
- 결정 성공 후 두 버튼 숨김
- 오류: 기존 `role="alert"`에 `Error.message` 표시

- [ ] **Step 4: 관리자 승인 테스트 통과 확인**

Run: `npx vitest run app/admin/approve/page.test.tsx lib/api/signupApproval.test.ts`

Expected: PASS

- [ ] **Step 5: 관리자 승인 전환 커밋**

```bash
git add app/admin/approve lib/hooks/queries lib/hooks/mutations
git commit -m "refactor: 관리자 승인을 데이터 레이어로 이동"
```

### Task 4: README와 전체 검증

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1~3의 완성된 데이터 레이어
- Produces: 후속 개선 두 번째 항목의 완료 기록

- [ ] **Step 1: 직접 Supabase 호출 제거 확인**

Run:

```bash
rg -n "supabaseClient|supabase\\." app/set-password app/admin/approve
```

Expected: 검색 결과 없음

- [ ] **Step 2: README 두 번째 항목만 완료 처리**

`README.md`의 다음 항목만 `[x]`로 변경한다.

```md
- [x] `app/set-password`와 `app/admin/approve`는 아직 데이터 레이어를 거치지 않고 Supabase를 직접 호출합니다. 나머지 화면과 같은 패턴으로 옮길 수 있습니다.
```

완료된 상태에 맞게 문장을 다음과 같이 고친다.

```md
- [x] `app/set-password`와 `app/admin/approve`의 Supabase 직접 호출을 기존 데이터 레이어 패턴으로 옮겼습니다.
```

- [ ] **Step 3: 정적 검증 실행**

Run: `npm run typecheck && npm run lint && npm run format:check`

Expected: 모두 성공, 오류 및 경고 0

- [ ] **Step 4: 전체 테스트 실행**

Run: `npm test -- --run`

Expected: 기존 106개와 신규 API 테스트가 모두 통과

- [ ] **Step 5: 프로덕션 빌드 실행**

Run: `npm run build`

Expected: 성공. 환경변수 부족으로 실패하면 필요한 변수와 실패 지점을 기록하고, 코드 결함인지 분리한다.

- [ ] **Step 6: 보안 및 범위 검토**

`git diff origin/main...HEAD`를 확인해 아래를 검증한다.

- DB, RLS, RBAC, Edge Function 변경 없음
- 민감한 키 또는 클라이언트 공개 환경변수 추가 없음
- README의 다른 후속 개선 항목 변경 없음
- 페이지 UI와 CSS 변경 없음
- 관리자 승인 권한 검증이 프론트엔드로 이동하지 않음

- [ ] **Step 7: 문서와 검증 결과 커밋**

```bash
git add README.md
git commit -m "docs: 데이터 레이어 후속 개선 완료 표시"
```

- [ ] **Step 8: PR 준비**

base 브랜치 최신화 후 반드시 rebase하고 검증한다.

```bash
git fetch origin
git rebase origin/main
npm run typecheck
npm run lint
npm run format:check
npm test -- --run
npm run build
git push --force-with-lease -u origin refactor/fe-data-layer-followup
```

PR 제목·본문·체크리스트는 한글로 작성한다. PR 본문에 아래 문서를 작업 근거로 첨부한다.

- `docs/superpowers/specs/2026-07-25-fe-data-layer-followup-design.md`
- `docs/superpowers/plans/2026-07-25-fe-data-layer-followup.md`
