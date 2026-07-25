# 이메일 인증 회원가입 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discord 관리자 승인 회원가입을 제거하고 이메일·비밀번호·Turnstile·메일 인증만으로 가입하는 Supabase Auth 흐름으로 전환한다.

**Architecture:** 로그인 페이지는 React Query 인증 훅만 사용하고, 훅은 `lib/api/auth.ts`의 Supabase Auth 함수를 호출한다. Cloudflare Turnstile 토큰은 익명 세션 생성, 로그인, 가입 요청에 포함하며 Supabase Auth가 서버에서 검증한다. 가입은 세션을 저장하지 않는 별도 Supabase 클라이언트에서 실행해 기존 익명 세션을 유지한다. 관리자 승인 전용 화면·Edge Function·데이터 레이어·DB 테이블은 제거한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase JS, TanStack React Query, React Hook Form, Cloudflare Turnstile, Vitest, Supabase CLI

## Global Constraints

- 이메일과 비밀번호를 한 번에 입력하고 인증 링크 클릭 후 홈으로 이동한다.
- 가입 요청은 기본 클라이언트의 기존 익명 세션을 변경하지 않는다.
- 익명 세션 생성, 로그인, 가입 모두 유효한 Turnstile 토큰을 요구한다.
- Turnstile secret은 코드나 `NEXT_PUBLIC_` 환경변수에 저장하지 않는다.
- 과거 마이그레이션과 과거 설계·계획 문서는 삭제하지 않는다.
- 기존 추천·평점·그룹 스키마와 RLS 정책은 변경하지 않는다.
- 승인용 테이블은 새 마이그레이션에서만 제거한다.
- 제품 코드 변경은 실패 테스트를 먼저 확인한 뒤 최소 구현으로 진행한다.

---

## 파일 구조

| 파일                                                  | 책임                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `lib/supabaseClient.ts`                               | 기본 영속 클라이언트와 회원가입 전용 비영속 클라이언트  |
| `lib/types/api/auth.types.ts`                         | CAPTCHA를 포함한 로그인·가입 요청 타입                  |
| `lib/api/auth.ts`                                     | CAPTCHA 기반 익명 세션 생성, 로그인, 비영속 이메일 가입 |
| `lib/hooks/mutations/useAuthMutations.ts`             | 로그인·가입 뮤테이션과 캐시 초기화                      |
| `components/AuthTurnstile.tsx`                        | 공통 Turnstile 토큰·reset 경계                          |
| `components/AnonymousSessionGate.tsx`                 | 신규 방문자의 CAPTCHA 검증과 익명 세션 부트스트랩       |
| `app/login/page.tsx`                                  | 로그인·회원가입 폼, 비밀번호 확인, 사용자 안내          |
| `supabase/migrations/0008_remove_signup_approval.sql` | 승인용 두 테이블 제거                                   |
| `supabase/config.toml`                                | 로컬 이메일 확인·Turnstile·redirect 설정                |
| `README.md`                                           | 새 회원가입 흐름과 외부 설정·배포 명령                  |

### Task 1: 이메일 가입 Auth API와 뮤테이션 추가

**Files:**

- Modify: `lib/types/api/auth.types.ts`
- Modify: `lib/supabaseClient.ts`
- Modify: `lib/api/auth.test.ts`
- Modify: `lib/api/auth.ts`
- Modify: `lib/hooks/mutations/useAuthMutations.ts`
- Modify: `lib/messages.ts`

**Interfaces:**

- Produces: `SignInRequest { email: string; password: string; captchaToken: string }`
- Produces: `SignupRequest { email: string; password: string; captchaToken: string; emailRedirectTo: string }`
- Produces: `ensureSession(captchaToken: string): Promise<void>`
- Produces: `signUp(request: SignupRequest): Promise<string>`
- Produces: `useSignUp()`

- [ ] **Step 1: 로그인 CAPTCHA 전달 실패 테스트 작성**

`lib/api/auth.test.ts`의 Supabase Auth 모킹에 `signInWithPassword`를 추가하고 다음 계약을
검증한다.

```ts
it('로그인 요청에 CAPTCHA 토큰을 전달합니다', async () => {
  signInWithPassword.mockResolvedValue({ error: null });

  await signIn({
    email: 'user@example.com',
    password: 'password1',
    captchaToken: 'captcha-token',
  });

  expect(signInWithPassword).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'password1',
    options: { captchaToken: 'captcha-token' },
  });
});
```

- [ ] **Step 2: 로그인 API 테스트가 실패하는지 확인**

Run: `npx vitest run lib/api/auth.test.ts`

Expected: 실제 호출에 `options.captchaToken`이 없어 FAIL

- [ ] **Step 3: 로그인 타입과 API 최소 변경**

```ts
export type SignInRequest = {
  email: string;
  password: string;
  captchaToken: string;
};
```

`signIn()`은 `supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })`를
호출하고 기존처럼 `assertNoError`로 오류를 승격한다.

- [ ] **Step 4: 로그인 CAPTCHA 테스트 통과 확인**

Run: `npx vitest run lib/api/auth.test.ts`

Expected: PASS

- [ ] **Step 5: 익명 세션 CAPTCHA와 이메일 가입 분리 실패 테스트 작성**

`lib/supabaseClient.ts`가 기본 `supabase`와 세션 저장을 끈 `signupSupabase`를 각각 export하게
한다. 기본 Supabase Auth 모킹에 `signInAnonymously`를 추가하고 `signupSupabase.auth.signUp`을
모킹해 아래 계약을 각각 검증한다.

```ts
it('세션이 없으면 CAPTCHA 토큰으로 익명 세션을 생성합니다', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  signInAnonymously.mockResolvedValue({ error: null });

  await ensureSession('captcha-token');

  expect(signInAnonymously).toHaveBeenCalledWith({
    options: { captchaToken: 'captcha-token' },
  });
});

it('기존 익명 세션을 유지한 채 비영속 클라이언트로 가입합니다', async () => {
  getSession.mockResolvedValue({
    data: { session: { user: { is_anonymous: true } } },
    error: null,
  });
  signupClientSignUp.mockResolvedValue({ error: null });

  await signUp({
    email: 'user@example.com',
    password: 'password1',
    captchaToken: 'captcha-token',
    emailRedirectTo: 'https://example.com/',
  });

  expect(signupClientSignUp).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'password1',
    options: {
      captchaToken: 'captcha-token',
      emailRedirectTo: 'https://example.com/',
    },
  });
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

it('실사용자 세션에서는 회원가입하지 않습니다', async () => {
  getSession.mockResolvedValue({
    data: { session: { user: { is_anonymous: false } } },
    error: null,
  });

  await expect(signUp(request)).rejects.toThrow('이미 로그인되어 있습니다.');
  expect(signupClientSignUp).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: 이메일 가입 테스트가 실패하는지 확인**

Run: `npx vitest run lib/api/auth.test.ts`

Expected: `signUp` 함수와 새 요청 타입이 없어 FAIL

- [ ] **Step 7: 이메일 가입 API 최소 구현**

`SignupRequest`에 `email`, `password`, `captchaToken`, `emailRedirectTo`를 정의한다.

`ensureSession(captchaToken)`은 세션이 없을 때만
`signInAnonymously({ options: { captchaToken } })`를 호출하고 오류를 승격한다.

`signUp()`은 다음 순서를 지킨다.

1. `getSession()`으로 현재 세션 확인
2. 비익명 세션이면 `MESSAGES.ALREADY_LOGGED_IN` 예외
3. `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`인 별도 Supabase
   클라이언트에서 `signUp()` 호출
4. 성공 시 `MESSAGES.SIGNUP_CONFIRM_EMAIL` 반환

별도 클라이언트는 기존 익명 세션의 localStorage와 Auth 이벤트를 건드리지 않는다.

- [ ] **Step 8: 가입 뮤테이션 구현**

`useSignUp()`은 `signUp()`을 호출하고 성공 시 `queryClient.clear()`를 실행한다.
기존 `useRequestSignup()`은 아직 삭제하지 않고 Task 3에서 소비자와 함께 제거한다.

- [ ] **Step 9: Auth API 테스트 통과 확인**

Run: `npx vitest run lib/api/auth.test.ts`

Expected: PASS

- [ ] **Step 10: Auth API 커밋**

```bash
git add lib/types/api/auth.types.ts lib/supabaseClient.ts lib/api/auth.test.ts lib/api/auth.ts lib/hooks/mutations/useAuthMutations.ts lib/messages.ts
git commit -m "feat: 이메일 인증 회원가입 API 추가"
```

### Task 2: 공통 Turnstile과 익명 세션 게이트 추가

**Files:**

- Create: `components/AuthTurnstile.tsx`
- Create: `components/AuthTurnstile.test.tsx`
- Create: `components/AnonymousSessionGate.tsx`
- Create: `components/AnonymousSessionGate.test.tsx`
- Modify: `app/providers.tsx`
- Modify: `lib/hooks/useAuth.ts`
- Modify: `app/page.tsx`
- Modify: `app/page.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- Produces: `AuthTurnstileProps { onTokenChange(token: string): void }`
- Produces: ref API `AuthTurnstileHandle { reset(): void }`
- Produces: 세션이 없는 추천 화면에서만 익명 세션을 만드는 `AnonymousSessionGate`

- [ ] **Step 1: Turnstile 컴포넌트 실패 테스트 작성**

`@marsidev/react-turnstile`을 모킹하되 실제 `AuthTurnstile`의 동작을 검증한다.

```tsx
it('검증 성공 토큰을 부모에게 전달합니다', () => {
  const onTokenChange = vi.fn();
  render(<AuthTurnstile onTokenChange={onTokenChange} />);

  fireEvent.click(screen.getByRole('button', { name: 'CAPTCHA 성공' }));

  expect(onTokenChange).toHaveBeenCalledWith('captcha-token');
});

it('만료와 오류 시 토큰을 비웁니다', () => {
  const onTokenChange = vi.fn();
  render(<AuthTurnstile onTokenChange={onTokenChange} />);

  fireEvent.click(screen.getByRole('button', { name: 'CAPTCHA 만료' }));
  expect(onTokenChange).toHaveBeenLastCalledWith('');
});

it('site key가 없으면 설정 오류를 표시합니다', () => {
  render(<AuthTurnstile onTokenChange={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('CAPTCHA 설정을 확인해 주세요.');
});
```

- [ ] **Step 2: Turnstile 테스트가 실패하는지 확인**

Run: `npx vitest run components/AuthTurnstile.test.tsx`

Expected: 컴포넌트와 패키지가 없어 FAIL

- [ ] **Step 3: Cloudflare 권장 React 패키지 설치**

Run: `npm install @marsidev/react-turnstile`

Expected: `package.json`과 lockfile에 의존성 추가

- [ ] **Step 4: Turnstile 최소 구현**

`forwardRef`와 `useImperativeHandle`로 `reset()`을 노출한다.

- `onSuccess(token)` → `onTokenChange(token)`
- `onExpire`, `onError`, reset 직후 → `onTokenChange('')`
- `options={{ size: 'flexible', theme: 'auto' }}`로 현재 UI 폭과 테마에 맞춤
- 환경변수가 비어 있으면 위젯 대신 `role="alert"` 설정 오류 표시

- [ ] **Step 5: Turnstile 테스트 통과 확인**

Run: `npx vitest run components/AuthTurnstile.test.tsx`

Expected: PASS

- [ ] **Step 6: 익명 세션 게이트 실패 테스트 작성**

검증 항목:

- 기존 세션이 있으면 CAPTCHA 없이 자식 화면 표시
- `/login`에서는 세션이 없어도 익명 세션 생성 없이 자식 화면 표시
- 홈에 세션이 없으면 Turnstile과 공통 Spinner 표시
- CAPTCHA 성공 시 `ensureSession(token)` 호출 후 자식 화면 표시
- 생성 실패 시 오류와 재시도 UI 표시

Run: `npx vitest run components/AnonymousSessionGate.test.tsx`

Expected: 컴포넌트가 없어 FAIL

- [ ] **Step 7: 익명 세션 게이트 구현**

`AnonymousSessionGate`는 최초 마운트에서 세션을 확인한다. `/login`이거나 기존 세션이 있으면 즉시
자식을 렌더하고, 그 외에는 `AuthTurnstile`을 표시한다. 토큰 검증 후 `ensureSession(token)`이
성공해야 자식을 렌더한다. 오류 시 위젯을 reset하고 명시적인 재시도 버튼을 제공한다.

`app/providers.tsx`에서 `QueryClientProvider` 안쪽에 게이트를 배치한다.
`useAuth()`는 더 이상 토큰 없는 `ensureSession()`을 호출하지 않고 현재 사용자 조회와 Auth 상태
구독만 담당한다. 로그아웃 성공 시에는 홈을 새로 탐색해 게이트가 새 Turnstile 토큰으로 익명
세션을 만들게 한다.

- [ ] **Step 8: 게이트 테스트와 관련 회귀 테스트 통과 확인**

Run:

```bash
npx vitest run components/AuthTurnstile.test.tsx components/AnonymousSessionGate.test.tsx app/page.test.tsx
```

Expected: PASS

- [ ] **Step 9: Turnstile·세션 게이트 커밋**

```bash
git add components/AuthTurnstile.tsx components/AuthTurnstile.test.tsx components/AnonymousSessionGate.tsx components/AnonymousSessionGate.test.tsx app/providers.tsx lib/hooks/useAuth.ts app/page.tsx app/page.test.tsx package.json package-lock.json
git commit -m "feat: Turnstile 기반 익명 세션 게이트 추가"
```

### Task 3: 로그인 화면을 이메일 가입 UI로 전환

**Files:**

- Modify: `app/login/page.test.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/login/login.module.css`

**Interfaces:**

- Consumes: `useSignIn()`, `useSignUp()`
- Consumes: `AuthTurnstile`과 `reset()` ref
- Produces: 이메일·비밀번호·비밀번호 확인 회원가입 dialog

- [ ] **Step 1: 로그인 CAPTCHA 실패 테스트 작성**

API 모킹 대신 기존 데이터 훅 통합 패턴을 유지하고 Supabase Auth를 모킹한다.
`AuthTurnstile`은 클릭 가능한 테스트 더블로 모킹한다.

검증 항목:

- CAPTCHA 전에는 로그인 버튼 비활성화
- CAPTCHA 성공 후 로그인 버튼 활성화
- 로그인 호출에 `captchaToken` 전달
- 요청 완료 후 CAPTCHA reset

Run: `npx vitest run app/login/page.test.tsx`

Expected: 현재 로그인 요청에 CAPTCHA가 없어 FAIL

- [ ] **Step 2: 회원가입 UI 실패 테스트 작성**

기존 관리자 승인 요청 어설션을 제거하고 다음 사용자 동작을 검증한다.

- 버튼·dialog 제목이 “회원가입”으로 표시
- 이메일·비밀번호·비밀번호 확인 입력 표시
- 비밀번호 입력에 `minLength=8`
- 확인값 불일치 시 가입 요청 없이 오류 표시
- CAPTCHA 전에는 가입 버튼 비활성화
- 성공 토큰 후 `signUp()`에 이메일, 비밀번호, 토큰, `${location.origin}/` 전달
- 성공 시 “인증 메일을 확인해 주세요.” 표시
- 실패 시 오류 표시하고 버튼 재활성화
- 요청 완료 후 CAPTCHA reset

Run: `npx vitest run app/login/page.test.tsx`

Expected: 현재 화면이 이메일만 관리자 승인 API로 보내므로 FAIL

- [ ] **Step 3: 로그인 폼에 Turnstile 연결**

로그인용 `captchaToken` 상태와 `AuthTurnstileHandle` ref를 둔다.
`useSignIn`에 CAPTCHA 토큰을 전달하고 mutation의 `onSettled`에서 위젯과 토큰을 초기화한다.

- [ ] **Step 4: 회원가입 폼 전환**

별도 `SignupFormValues`에 `email`, `password`, `passwordConfirm`을 정의한다.
React Hook Form의 `validate`로 두 비밀번호 일치를 검사한다.

```ts
signupForm.register('passwordConfirm', {
  required: true,
  validate: (value) =>
    value === signupForm.getValues('password') || '비밀번호가 일치하지 않습니다.',
});
```

제출 시 `useSignUp().mutate()`에 CAPTCHA 토큰과 홈 redirect URL을 전달한다.
dialog를 다시 열 때 폼, mutation, CAPTCHA 토큰과 위젯을 모두 초기화한다.

- [ ] **Step 5: 로그인 화면 테스트 통과 확인**

Run: `npx vitest run app/login/page.test.tsx components/AuthTurnstile.test.tsx lib/api/auth.test.ts`

Expected: PASS

- [ ] **Step 6: 로그인 화면 커밋**

```bash
git add app/login
git commit -m "feat: 회원가입을 이메일 인증 방식으로 전환"
```

### Task 4: 관리자 승인 코드와 화면 제거

**Files:**

- Delete: `app/admin/approve/page.tsx`
- Delete: `app/admin/approve/page.test.tsx`
- Delete: `app/set-password/page.tsx`
- Delete: `app/set-password/page.test.tsx`
- Delete: `lib/api/signupApproval.ts`
- Delete: `lib/api/signupApproval.test.ts`
- Delete: `lib/hooks/queries/useSignupApprovalQueries.ts`
- Delete: `lib/hooks/queries/useAuthQueries.ts`
- Delete: `lib/hooks/mutations/useSignupApprovalMutations.ts`
- Delete: `lib/types/api/signupApproval.types.ts`
- Delete: `supabase/functions/signup-request/index.ts`
- Delete: `supabase/functions/signup-request/index.test.ts`
- Delete: `supabase/functions/approve-signup/index.ts`
- Delete: `supabase/functions/approve-signup/index.test.ts`
- Delete: `supabase/functions/_shared/notify.ts`
- Delete: `supabase/functions/_shared/notify.test.ts`
- Delete: `supabase/functions/_shared/token.ts`
- Delete: `supabase/functions/_shared/token.test.ts`
- Modify: `lib/api/auth.ts`
- Modify: `lib/api/index.ts`
- Modify: `lib/hooks/queries/index.ts`
- Modify: `lib/hooks/mutations/index.ts`
- Modify: `lib/hooks/mutations/useAuthMutations.ts`
- Modify: `lib/types/api/auth.types.ts`
- Modify: `lib/types/api/index.ts`
- Modify: `lib/constants.ts`
- Modify: `lib/messages.ts`

**Interfaces:**

- Consumes: Task 1~3의 새 `signUp`, `useSignUp`
- Produces: 관리자 승인 코드와 import가 없는 빌드

- [ ] **Step 1: 삭제 전 참조 목록 기록**

Run:

```bash
rg -n "signup-request|approve-signup|signupApproval|useInviteSession|useUpdatePassword|sendAdminNotification|generateApprovalToken|SIGNUP_REQUEST|SIGNUP_REQUEST_ACCEPTED|PASSWORD_UPDATE_FAILED" app lib supabase --glob '!migrations/**'
```

Expected: 제거 대상 파일과 배럴 export만 출력

- [ ] **Step 2: 승인된 파일 삭제**

위 `Delete` 목록의 파일만 `git rm`으로 제거한다. 과거 마이그레이션과 `docs/superpowers`의
과거 설계·계획은 삭제하지 않는다.

- [ ] **Step 3: 남은 배럴·상수·타입 정리**

- `requestSignup`, `hasInviteSession`, `updatePassword` 제거
- `useRequestSignup`, `useUpdatePassword` 제거
- 승인 API·쿼리·뮤테이션·타입 export 제거
- `API_ROUTES.SIGNUP_REQUEST`, 승인·비밀번호 설정 전용 문구 제거
- 인증 타입 주석을 현재 Supabase Auth 계약으로 수정

- [ ] **Step 4: 잔여 참조가 없는지 확인**

Run:

```bash
rg -n "signup-request|approve-signup|signupApproval|useInviteSession|useUpdatePassword|sendAdminNotification|generateApprovalToken|SIGNUP_REQUEST|SIGNUP_REQUEST_ACCEPTED|PASSWORD_UPDATE_FAILED" app lib supabase --glob '!migrations/**'
```

Expected: 검색 결과 없음

- [ ] **Step 5: 프론트 테스트·타입 확인**

Run: `npm run typecheck && npm test -- --run`

Expected: 제거된 테스트를 제외하고 전체 통과

- [ ] **Step 6: 승인 흐름 제거 커밋**

```bash
git add app lib supabase/functions
git commit -m "refactor: 관리자 승인 회원가입 흐름 제거"
```

### Task 5: 승인용 DB 테이블 제거와 Auth 설정

**Files:**

- Create: `supabase/migrations/0008_remove_signup_approval.sql`
- Modify: `supabase/config.toml`
- Modify: `.env.local.example`

**Interfaces:**

- Produces: `signup_attempts`, `signup_requests`가 없는 최종 public 스키마
- Produces: 로컬 이메일 확인·Turnstile 설정

- [ ] **Step 1: 제거 마이그레이션 작성**

```sql
-- 관리자 승인 회원가입을 Supabase 이메일 인증으로 대체하여 요청·사용량 데이터를 더 이상 수집하지 않는다.
drop table if exists public.signup_attempts;
drop table if exists public.signup_requests;
```

테이블 삭제로 소속 인덱스, grant, RLS 설정도 함께 제거됩니다. 다른 사용자 데이터 테이블은
건드리지 않는다.

- [ ] **Step 2: Supabase 로컬 Auth 설정 변경**

`supabase/config.toml`에서 다음을 설정한다.

```toml
[auth.email]
enable_signup = true
enable_confirmations = true

[auth.captcha]
enabled = true
provider = "turnstile"
secret = "env(SUPABASE_AUTH_CAPTCHA_SECRET)"
```

`minimum_password_length`는 UI와 동일하게 `8`로 올린다. localhost 홈 URL을 redirect 허용
목록에 정확히 포함한다. 제거된 Edge Function의 별도 `[functions.*]` 설정이 있으면 삭제한다.

- [ ] **Step 3: 공개 환경변수 예시 추가**

`.env.local.example`에는 값 없이 다음 site key만 추가한다.

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

Turnstile secret은 예시 파일에도 넣지 않고 README에서 Dashboard/로컬 shell 설정으로만 안내한다.

- [ ] **Step 4: 로컬 DB reset 검증**

Run: `npx supabase db reset`

Expected: 모든 마이그레이션 성공

Run:

```bash
npx supabase db query "select to_regclass('public.signup_requests'), to_regclass('public.signup_attempts');"
```

Expected: 두 값 모두 null

Supabase 로컬 런타임을 사용할 수 없으면 정확한 실패 이유를 기록하고 SQL 파일 정적 검증과 CI의
Supabase Preview 결과로 보완한다.

- [ ] **Step 5: 마이그레이션·설정 커밋**

```bash
git add supabase/migrations/0008_remove_signup_approval.sql supabase/config.toml .env.local.example
git commit -m "chore: 이메일 인증용 Supabase 설정 전환"
```

### Task 6: README와 전체 검증

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: Task 1~5의 완성된 이메일 인증 가입 흐름
- Produces: 운영자가 따라 할 수 있는 Auth·Turnstile 설정 문서

- [ ] **Step 1: README 회원가입 설명 갱신**

다음을 현재 구조에 맞게 수정한다.

- 외부 서비스에서 Discord 제거, Cloudflare Turnstile 추가
- “관리자 승인제”를 “이메일 인증 회원가입”으로 변경
- Edge Function 목록과 배포 명령에서 `signup-request`, `approve-signup` 제거
- `SITE_URL`, `DISCORD_WEBHOOK_URL` 승인용 설명 제거
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`와 Dashboard secret 설정 안내
- Site URL·Redirect URL 허용 목록과 이메일 확인 활성화 안내
- Supabase 내장 메일 한도와 SMTP 후속 과제 유지
- 최신 설계 문서 링크 추가, 과거 승인·Discord 설계는 “대체된 설계”로 구분

- [ ] **Step 2: 전체 정적 검증**

Run: `npm run typecheck && npm run lint`

Expected: 오류·경고 0

- [ ] **Step 3: 전체 테스트**

Run: `npm test -- --run`

Expected: 남은 전체 테스트 통과

- [ ] **Step 4: 변경 파일 포맷 검사**

Run:

```bash
git diff --name-only -z origin/main...HEAD | xargs -0 npx prettier --check
```

Expected: 이번 변경 파일 모두 통과

저장소 전체 `format:check`가 기존 파일 때문에 실패하면 기존 기준선과 이번 변경을 분리해 보고한다.

- [ ] **Step 5: 프로덕션 빌드**

공개 형식 검증용 더미 값으로 실행한다.

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
NEXT_PUBLIC_GOOGLE_MAPS_KEY=test-maps-key \
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
npm run build
```

Expected: 성공

- [ ] **Step 6: 보안·범위 검토**

`git diff origin/main...HEAD`에서 다음을 확인한다.

- Turnstile secret이나 다른 민감 키 없음
- 새 public 테이블 없음
- 기존 사용자 데이터 RLS 변경 없음
- 승인용 두 테이블만 새 마이그레이션에서 제거
- 과거 마이그레이션·설계 문서 보존
- 익명 세션 생성·가입·로그인 모두 CAPTCHA 토큰 전달
- 관리자 승인·Discord 코드 참조 없음

- [ ] **Step 7: README 커밋**

```bash
git add README.md
git commit -m "docs: 이메일 인증 회원가입 설정 안내"
```

- [ ] **Step 8: PR 준비**

```bash
git fetch origin
git rebase origin/main
npm run typecheck
npm run lint
npm test -- --run
git diff --name-only -z origin/main...HEAD | xargs -0 npx prettier --check
git push --force-with-lease -u origin feature/email-verification-signup
```

PR 제목·본문·체크리스트는 한글로 작성한다. PR 본문에 다음 작업 근거를 첨부한다.

- `docs/superpowers/specs/2026-07-25-email-verification-signup-design.md`
- `docs/superpowers/plans/2026-07-25-email-verification-signup.md`

외부 수동 설정 체크리스트를 미완료 상태로 명시한다.

- Supabase 이메일 확인 활성화
- Site URL·Redirect URL 허용 목록
- Cloudflare Turnstile 도메인과 site key
- Supabase Dashboard Turnstile secret
- Auth rate limit·메일 발송 한도 확인
