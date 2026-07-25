# 회원가입 인증 메일 재전송 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원가입 성공 직후 가입한 이메일로 CAPTCHA 검증을 거쳐 인증 메일을 재전송하고, 요청·성공·실패·60초 쿨다운 상태를 기존 UI 스타일로 안내한다.

**Architecture:** 기존 비영속 `signupSupabase` 클라이언트에 가입 확인 메일 재전송 API를 추가하고 전용 React Query mutation으로 화면에 제공한다. 로그인 페이지는 가입 성공 이메일을 고정해 완료 화면으로 전환하며, 재전송 CAPTCHA와 60초 로컬 쿨다운을 관리한다. 서버 측 남용 방지는 Supabase Auth의 CAPTCHA와 이메일 rate limit이 담당하고 프론트 타이머는 반복 클릭을 줄이는 UX 보조로만 사용한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase JS 2, TanStack Query 5, React Hook Form, Cloudflare Turnstile, Vitest, Testing Library

## Global Constraints

- 재전송 대상은 가입 요청에 성공한 이메일로 고정한다.
- 재전송 요청은 `type: 'signup'`, CAPTCHA 토큰, 홈 redirect URL을 Supabase Auth에 전달한다.
- 요청 성공·실패 후 CAPTCHA를 reset해 일회용 토큰 재사용을 막는다.
- 요청 성공 후 60초 프론트엔드 쿨다운을 표시하되 보안용 rate limit으로 취급하지 않는다.
- 별도 Edge Function, 데이터베이스 테이블, 환경변수 또는 의존성을 추가하지 않는다.
- 기존 공통 `Spinner`, 오류 메시지 변환, CSS 변수를 재사용한다.
- 관련 없는 파일의 포맷이나 구조를 변경하지 않는다.

---

## 파일 구조

- `lib/types/api/auth.types.ts`: 재전송 요청의 이메일·CAPTCHA·redirect 계약을 정의한다.
- `lib/messages.ts`: 재전송 성공 문구의 단일 출처를 제공한다.
- `lib/api/auth.ts`: `signupSupabase.auth.resend()`를 호출하고 Supabase 오류를 예외로 승격한다.
- `lib/api/auth.test.ts`: 재전송 인자 전달과 오류 승격을 검증한다.
- `lib/hooks/mutations/useAuthMutations.ts`: 캐시를 비우지 않는 재전송 mutation을 제공한다.
- `lib/hooks/mutations/useAuthMutations.test.tsx`: mutation의 API 위임과 캐시 보존을 검증한다.
- `app/login/page.tsx`: 가입 완료 화면, 재전송 요청, CAPTCHA reset, 60초 쿨다운을 관리한다.
- `app/login/page.test.tsx`: 완료 화면과 재전송의 전체 사용자 상태를 검증한다.
- `app/login/login.module.css`: 완료 화면 이메일·보조 문구·재전송 버튼의 기존 스타일 연계를 정의한다.

### Task 1: 인증 메일 재전송 API

**Files:**

- Modify: `lib/types/api/auth.types.ts`
- Modify: `lib/messages.ts`
- Modify: `lib/api/auth.ts`
- Test: `lib/api/auth.test.ts`

**Interfaces:**

- Produces: `ResendSignupEmailRequest = { email: string; captchaToken: string; emailRedirectTo: string }`
- Produces: `resendSignupEmail(request: ResendSignupEmailRequest): Promise<string>`
- Returns: 성공 시 `MESSAGES.SIGNUP_CONFIRM_EMAIL_RESENT`

- [ ] **Step 1: API 실패 테스트 작성**

`signupSupabase.auth` mock에 `resend`를 추가하고 다음 두 테스트를 작성한다.

```ts
it('가입 인증 메일을 CAPTCHA 토큰과 홈 redirect로 재전송합니다', async () => {
  signupClientResend.mockResolvedValue({ data: {}, error: null });

  await expect(
    resendSignupEmail({
      email: 'user@example.com',
      captchaToken: 'captcha-token',
      emailRedirectTo: 'https://example.com/',
    }),
  ).resolves.toBe('인증 메일을 다시 보냈습니다.');

  expect(signupClientResend).toHaveBeenCalledWith({
    type: 'signup',
    email: 'user@example.com',
    options: {
      captchaToken: 'captcha-token',
      emailRedirectTo: 'https://example.com/',
    },
  });
});

it('인증 메일 재전송 오류를 예외로 승격합니다', async () => {
  signupClientResend.mockResolvedValue({
    data: {},
    error: { message: '잠시 후 다시 시도해 주세요.' },
  });

  await expect(
    resendSignupEmail({
      email: 'user@example.com',
      captchaToken: 'captcha-token',
      emailRedirectTo: 'https://example.com/',
    }),
  ).rejects.toMatchObject({ message: '잠시 후 다시 시도해 주세요.' });
});
```

- [ ] **Step 2: API 테스트가 예상대로 실패하는지 확인**

Run: `npm test -- lib/api/auth.test.ts`

Expected: `resendSignupEmail` export 또는 `signupClientResend`가 없어 FAIL

- [ ] **Step 3: 요청 타입과 API 최소 구현**

`lib/types/api/auth.types.ts`:

```ts
export type ResendSignupEmailRequest = {
  email: string;
  captchaToken: string;
  emailRedirectTo: string;
};
```

`lib/api/auth.ts`:

```ts
export async function resendSignupEmail({
  email,
  captchaToken,
  emailRedirectTo,
}: ResendSignupEmailRequest): Promise<string> {
  assertNoError(
    await signupSupabase.auth.resend({
      type: 'signup',
      email,
      options: { captchaToken, emailRedirectTo },
    }),
  );
  return MESSAGES.SIGNUP_CONFIRM_EMAIL_RESENT;
}
```

`lib/messages.ts`의 `MESSAGES`에 다음 항목을 추가한다.

```ts
SIGNUP_CONFIRM_EMAIL_RESENT: '인증 메일을 다시 보냈습니다.',
```

- [ ] **Step 4: API 테스트 통과 확인**

Run: `npm test -- lib/api/auth.test.ts`

Expected: PASS

- [ ] **Step 5: API 변경 커밋**

```bash
git add lib/types/api/auth.types.ts lib/messages.ts lib/api/auth.ts lib/api/auth.test.ts
git commit -m "feat: 가입 인증 메일 재전송 API 추가"
```

### Task 2: 재전송 React Query mutation

**Files:**

- Modify: `lib/hooks/mutations/useAuthMutations.ts`
- Test: `lib/hooks/mutations/useAuthMutations.test.tsx`

**Interfaces:**

- Consumes: `resendSignupEmail(request: ResendSignupEmailRequest): Promise<string>`
- Produces: `useResendSignupEmail(options?: UseMutationOptions<string, Error, ResendSignupEmailRequest>)`
- Invariant: 성공 시 기존 Query Client 캐시를 유지한다.

- [ ] **Step 1: mutation 실패 테스트 작성**

API mock에 `resendSignupEmail`을 추가하고 다음 테스트를 작성한다.

```ts
it('인증 메일을 재전송하고 기존 캐시는 유지합니다', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(['current-user'], { id: 'anonymous-user' });
  resendSignupEmailMock.mockResolvedValue('인증 메일을 다시 보냈습니다.');
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useResendSignupEmail(), { wrapper });
  const request = {
    email: 'user@example.com',
    captchaToken: 'captcha-token',
    emailRedirectTo: 'https://example.com/',
  };

  await act(async () => {
    await expect(result.current.mutateAsync(request)).resolves.toBe('인증 메일을 다시 보냈습니다.');
  });

  expect(resendSignupEmailMock).toHaveBeenCalledWith(request);
  expect(queryClient.getQueryData(['current-user'])).toEqual({ id: 'anonymous-user' });
});
```

- [ ] **Step 2: mutation 테스트가 예상대로 실패하는지 확인**

Run: `npm test -- lib/hooks/mutations/useAuthMutations.test.tsx`

Expected: `useResendSignupEmail` export가 없어 FAIL

- [ ] **Step 3: mutation 최소 구현**

```ts
export const useResendSignupEmail = (
  options?: UseMutationOptions<string, Error, ResendSignupEmailRequest>,
) =>
  useMutation({
    mutationFn: (request: ResendSignupEmailRequest) => resendSignupEmail(request),
    ...options,
  });
```

- [ ] **Step 4: mutation 테스트 통과 확인**

Run: `npm test -- lib/hooks/mutations/useAuthMutations.test.tsx`

Expected: PASS

- [ ] **Step 5: mutation 변경 커밋**

```bash
git add lib/hooks/mutations/useAuthMutations.ts lib/hooks/mutations/useAuthMutations.test.tsx
git commit -m "feat: 인증 메일 재전송 mutation 추가"
```

### Task 3: 가입 완료 및 재전송 UI

**Files:**

- Modify: `app/login/page.tsx`
- Modify: `app/login/login.module.css`
- Test: `app/login/page.test.tsx`

**Interfaces:**

- Consumes: `useResendSignupEmail()`
- Consumes: `AuthTurnstileHandle.reset()`
- State: `signupEmail: string`, `resendCaptchaToken: string`, `resendCooldown: number`
- Constant: `RESEND_COOLDOWN_SECONDS = 60`

- [ ] **Step 1: 가입 완료 화면 실패 테스트 작성**

가입 성공 후 다음을 검증한다.

```ts
expect(within(dialog).queryByLabelText('회원가입 비밀번호')).not.toBeInTheDocument();
expect(within(dialog).getByText('guest@example.com')).toBeInTheDocument();
expect(within(dialog).getByRole('button', { name: '인증 메일 재전송' })).toBeDisabled();
```

재전송용 CAPTCHA를 확인한 뒤 `signupSupabase.auth.resend`가 다음 값으로 호출되는 테스트를 추가한다.

```ts
expect(resend).toHaveBeenCalledWith({
  type: 'signup',
  email: 'guest@example.com',
  options: {
    captchaToken: 'captcha-token',
    emailRedirectTo: `${window.location.origin}/`,
  },
});
```

- [ ] **Step 2: 완료 화면 테스트가 예상대로 실패하는지 확인**

Run: `npm test -- app/login/page.test.tsx`

Expected: 가입 폼이 계속 노출되고 재전송 버튼이 없어 FAIL

- [ ] **Step 3: 요청·스피너·오류·쿨다운 실패 테스트 작성**

다음 케이스를 각각 테스트한다.

```ts
it('재전송 요청 중 공통 스피너를 보여줍니다', async () => {
  resend.mockReturnValue(new Promise(() => {}));
  // 가입 성공 → 재전송 CAPTCHA 확인 → 재전송 클릭
  const button = await within(dialog).findByRole('button', { name: '재전송 중…' });
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(within(button).getByTestId('spinner')).toBeInTheDocument();
});

it('재전송 성공 후 60초 쿨다운과 성공 안내를 표시합니다', async () => {
  vi.useFakeTimers();
  // 재전송 성공
  expect(within(dialog).getByRole('status')).toHaveTextContent('인증 메일을 다시 보냈습니다.');
  expect(within(dialog).getByRole('button', { name: '60초 후 재전송' })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(within(dialog).getByRole('button', { name: '59초 후 재전송' })).toBeDisabled();
  vi.useRealTimers();
});

it('재전송 실패를 표시하고 CAPTCHA를 초기화합니다', async () => {
  resend.mockResolvedValue({ data: {}, error: { message: '재전송 실패' } });
  // 재전송 요청
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('재전송 실패');
  expect(captchaReset).toHaveBeenCalled();
});
```

기존 “닫았다가 다시 열기” 테스트에는 가입 완료·재전송 상태가 사라지고 원래 가입 폼이 복구되는
검증을 추가한다.

- [ ] **Step 4: 상태 테스트가 예상대로 실패하는지 확인**

Run: `npm test -- app/login/page.test.tsx`

Expected: 재전송 mutation과 완료 화면 상태가 없어 FAIL

- [ ] **Step 5: 가입 완료 화면과 재전송 상태 최소 구현**

`app/login/page.tsx`에서:

- `signUp.mutate()`의 `onSuccess`에서 제출한 `values.email`을 `signupEmail`에 저장한다.
- `signupEmail`이 있으면 기존 가입 폼 대신 이메일 안내, 재전송용 `AuthTurnstile`, 버튼을 렌더한다.
- 재전송 mutation에 고정 이메일, CAPTCHA 토큰, `${location.origin}${ROUTES.HOME}`을 전달한다.
- `onSuccess`에서 쿨다운을 60으로 설정한다.
- `onSettled`에서 재전송 CAPTCHA를 reset하고 토큰을 비운다.
- `useEffect`로 쿨다운이 0보다 클 때 1초 후 값을 하나 줄이는 timeout을 만들고 cleanup한다.
- `openSignup()`에서 가입 이메일, 재전송 mutation, 토큰, 쿨다운을 초기화한다.

버튼 상태:

```tsx
disabled={!resendCaptchaToken || resendEmail.isPending || resendCooldown > 0}
aria-busy={resendEmail.isPending}
```

버튼 문구 우선순위:

```ts
resendEmail.isPending
  ? '재전송 중…'
  : resendCooldown > 0
    ? `${resendCooldown}초 후 재전송`
    : '인증 메일 재전송';
```

- [ ] **Step 6: 기존 스타일에 맞는 완료 화면 CSS 추가**

`login.module.css`에 기존 `notice`, `dialogDescription`, CSS 변수를 재사용하는 최소 클래스만 추가한다.

```css
.confirmationEmail {
  margin: 0;
  font-weight: 600;
  text-align: center;
  overflow-wrap: anywhere;
}

.resendHelp {
  margin: -8px 0 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}
```

- [ ] **Step 7: UI 테스트 통과 확인**

Run: `npm test -- app/login/page.test.tsx`

Expected: PASS

- [ ] **Step 8: UI 변경 커밋**

```bash
git add app/login/page.tsx app/login/page.test.tsx app/login/login.module.css
git commit -m "feat: 가입 인증 메일 재전송 UI 추가"
```

### Task 4: 전체 검증

**Files:**

- Verify only

**Interfaces:**

- 전체 인증 API·mutation·화면이 타입과 런타임 계약을 공유한다.

- [ ] **Step 1: 관련 테스트 실행**

Run: `npm test -- lib/api/auth.test.ts lib/hooks/mutations/useAuthMutations.test.tsx app/login/page.test.tsx`

Expected: PASS

- [ ] **Step 2: 전체 테스트 실행**

Run: `npm test`

Expected: PASS

- [ ] **Step 3: 정적 검사 실행**

Run: `npm run typecheck`

Expected: PASS

Run: `npm run lint`

Expected: PASS

Run: `npm run format:check`

Expected: PASS

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: 작업 범위와 커밋 확인**

Run: `git status --short && git log --oneline --decorate -6`

Expected: 의도하지 않은 변경이 없고 작업 트리가 깨끗함
