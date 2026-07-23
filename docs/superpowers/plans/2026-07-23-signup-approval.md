# 승인 기반 회원가입 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방문자가 이메일로 가입을 요청하면 관리자 승인 후 초대 메일로 계정을 만들 수 있는 승인 기반 회원가입을 추가한다.

**Architecture:** Supabase(Postgres+RLS, Edge Function, Auth invite) + Resend 이메일. 방문자 요청과 관리자 승인은 모두 Edge Function을 거치고, signup_requests 테이블은 service_role만 접근한다. 승인 시 admin.inviteUserByEmail로 가입 링크를 보낸다.

**Tech Stack:** Next.js(App Router, TS), Supabase Edge Functions(Deno), Resend, Vitest, Deno test.

## Global Constraints

- Resend API 키와 Supabase 관리자 API(inviteUserByEmail)는 Edge Function에서만. 프론트 노출 금지.
- signup_requests는 RLS로 service_role만 접근(방문자·관리자 모두 Edge Function 경유).
- 승인 토큰은 랜덤 32바이트, 만료 3일, 승인/거절 시 1회용.
- 회원가입 요청 rate limit(IP+email)로 스팸 차단. 스팸이 Resend 발송·요금으로 직결됨을 주석 명시.
- ADMIN_EMAIL=jindevst@gmail.com은 Edge Function 시크릿. 프론트 하드코딩 금지.
- Deno 테스트 실행은 기존 CI와 동일하게 `deno test --no-check --allow-env --node-modules-dir=auto` 패턴 사용. Edge Function은 fetch(Resend)·supabase admin을 주입 가능하게 해 테스트에서 모킹.
- 구현 전에 이메일과 IP가 `signup_requests` 한 테이블에 함께 저장되는 것이 적절한지 사람이 직접 확인한다. 이 계획은 확정 스펙대로 별도 사용량 컬럼 없이 실제 요청 행의 `request_ip`와 `email`을 최근 요청 집계에 사용하며, 구독 상태와 일반 API 사용량은 추가하지 않는다.

---

## 파일 구조

- `supabase/migrations/0003_signup_requests.sql`: 요청 저장 스키마, RLS, 인덱스를 정의한다.
- `supabase/tests/0003_signup_requests.test.sql`: 스키마 제약과 anon/authenticated 직접 접근 차단을 검증한다.
- `supabase/functions/_shared/token.ts`: 암호학적으로 안전한 32바이트 승인 토큰을 생성한다.
- `supabase/functions/_shared/token.test.ts`: 토큰 길이와 호출 간 유일성을 검증한다.
- `supabase/functions/_shared/email.ts`: 주입된 `fetch`로 Resend 관리자 알림을 발송한다.
- `supabase/functions/_shared/email.test.ts`: Resend URL, 인증 헤더, 본문을 검증한다.
- `supabase/functions/signup-request/index.ts`: 가입 여부·rate limit·중복을 검사하고 요청 저장 및 관리자 알림을 수행한다.
- `supabase/functions/signup-request/index.test.ts`: 차단, 중복, 정상 접수 흐름을 외부 호출 없이 검증한다.
- `supabase/functions/approve-signup/index.ts`: 승인 토큰 조회와 승인·거절 및 Auth 초대를 수행한다.
- `supabase/functions/approve-signup/index.test.ts`: 조회, 토큰 오류, 승인, 기존 사용자, 거절을 검증한다.
- `app/login/page.tsx`: 기존 로그인을 보존하면서 회원가입 요청 폼을 추가한다.
- `app/login/page.test.tsx`: 기존 로그인 회귀 테스트와 가입 요청 성공·오류 테스트를 함께 둔다.
- `app/admin/approve/page.tsx`: 토큰으로 요청을 조회하고 승인 또는 거절한다.
- `app/admin/approve/page.test.tsx`: 관리자 화면의 조회·승인·거절·무효 토큰 표시를 검증한다.
- `app/set-password/page.tsx`: 초대 세션을 확인하고 새 비밀번호를 설정한다.
- `app/set-password/page.test.tsx`: 세션 없음, 설정 성공, 설정 오류를 검증한다.

### Task 1: signup_requests 마이그레이션 + RLS

**Files:**
- Create: `supabase/migrations/0003_signup_requests.sql`
- Test: `supabase/tests/0003_signup_requests.test.sql`

**Interfaces:**
- Consumes: PostgreSQL `pgcrypto` 확장과 Supabase 역할 `anon`, `authenticated`, `service_role`.
- Produces: `public.signup_requests(id uuid, email text, request_ip inet, token text, status text, created_at timestamptz, expires_at timestamptz)`; Edge Function의 service role 전용 `SELECT/INSERT/UPDATE`.

- [ ] **Step 1: 실패하는 pgTAP 테스트를 작성한다**

`supabase/tests/0003_signup_requests.test.sql`을 다음과 같이 작성한다.

```sql
begin;
select plan(16);

select has_table('public', 'signup_requests', 'signup_requests exists');
select col_is_pk('public', 'signup_requests', 'id', 'id is primary key');
select col_type_is('public', 'signup_requests', 'email', 'text', 'email is text');
select col_not_null('public', 'signup_requests', 'email', 'email is required');
select col_type_is('public', 'signup_requests', 'request_ip', 'inet', 'request_ip is inet');
select col_not_null('public', 'signup_requests', 'request_ip', 'request_ip is required');
select col_is_unique('public', 'signup_requests', 'token', 'token is unique');
select col_not_null('public', 'signup_requests', 'expires_at', 'expires_at is required');
select col_has_default('public', 'signup_requests', 'status', 'status has a default');
select col_has_default('public', 'signup_requests', 'created_at', 'created_at has a default');
select is(
  (select relrowsecurity from pg_class where oid = 'public.signup_requests'::regclass),
  true,
  'RLS is enabled'
);
select throws_ok(
  $$insert into public.signup_requests(email, request_ip, token, status, expires_at)
    values ('bad@example.com', '127.0.0.1', 'bad-status-token', 'unknown', now() + interval '3 days')$$,
  '23514', null, 'unknown status is rejected'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.signup_requests$$,
  '42501', null, 'anon cannot select signup requests'
);
select throws_ok(
  $$insert into public.signup_requests(email, request_ip, token, expires_at)
    values ('anon@example.com', '127.0.0.1', 'anon-token', now() + interval '3 days')$$,
  '42501', null, 'anon cannot insert signup requests'
);

reset role;
set local role authenticated;
select throws_ok(
  $$select count(*) from public.signup_requests$$,
  '42501', null, 'authenticated cannot select signup requests'
);
select throws_ok(
  $$update public.signup_requests set status = 'approved'$$,
  '42501', null, 'authenticated cannot update signup requests'
);

select * from finish();
rollback;
```

- [ ] **Step 2: DB 테스트가 실패하는지 확인한다**

Run:

```bash
supabase db reset && supabase test db
```

Expected: `0003_signup_requests.test.sql`이 `signup_requests` relation이 없다는 오류 또는 첫 `has_table` 실패로 종료한다.

- [ ] **Step 3: 최소 마이그레이션을 작성한다**

`supabase/migrations/0003_signup_requests.sql`을 다음과 같이 작성한다. `request_ip`는 스펙의 IP 기준 최근 요청 집계를 가능하게 하는 최소 필드이며, 별도 사용량이나 구독 상태를 담지 않는다.

```sql
create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  request_ip inet not null,
  token text unique not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index signup_requests_email_created_at_idx
  on public.signup_requests (email, created_at desc);
create index signup_requests_ip_created_at_idx
  on public.signup_requests (request_ip, created_at desc);

alter table public.signup_requests enable row level security;

-- 다른 사용자 데이터에 접근 가능한 우회 경로가 없도록 anon/authenticated에는
-- GRANT와 정책을 만들지 않는다. service_role은 Edge Function에서만 사용한다.
grant select, insert, update on public.signup_requests to service_role;
```

- [ ] **Step 4: 마이그레이션과 RLS 테스트가 통과하는지 확인한다**

Run:

```bash
supabase db reset && supabase test db
```

Expected: 모든 DB 테스트가 통과하고 마지막에 실패 수 `0`이 출력된다. 특히 anon/authenticated의 `SELECT/INSERT/UPDATE`가 `42501`로 차단되어 “이 정책으로 다른 사용자 데이터에 접근 가능한 우회 경로가 있는가?” 검토가 통과한다.

- [ ] **Step 5: 마이그레이션을 커밋한다**

```bash
git add supabase/migrations/0003_signup_requests.sql supabase/tests/0003_signup_requests.test.sql
git commit -m "feat: 회원가입 요청 테이블과 RLS 추가"
```

### Task 2: 공유 유틸 (토큰 + Resend 발송)

**Files:**
- Create: `supabase/functions/_shared/token.ts`
- Create: `supabase/functions/_shared/token.test.ts`
- Create: `supabase/functions/_shared/email.ts`
- Create: `supabase/functions/_shared/email.test.ts`

**Interfaces:**
- Consumes: Web Crypto `crypto.getRandomValues`, 주입 가능한 `typeof fetch`, Edge Function 시크릿 `RESEND_API_KEY`.
- Produces: `generateApprovalToken(): string`; `EmailDeps { fetch: typeof fetch; apiKey: string; from: string }`; `sendAdminNotification(deps: EmailDeps, input: { to: string; approveUrl: string; requesterEmail: string }): Promise<void>`.

- [ ] **Step 1: 토큰과 이메일 유틸의 실패 테스트를 작성한다**

`supabase/functions/_shared/token.test.ts`:

```ts
import { assertEquals, assertNotEquals, assertMatch } from 'jsr:@std/assert';
import { generateApprovalToken } from './token.ts';

Deno.test('32바이트 토큰을 64자리 소문자 hex로 생성합니다', () => {
  const token = generateApprovalToken();
  assertEquals(token.length, 64);
  assertMatch(token, /^[0-9a-f]{64}$/);
});

Deno.test('호출마다 다른 토큰을 생성합니다', () => {
  assertNotEquals(generateApprovalToken(), generateApprovalToken());
});
```

`supabase/functions/_shared/email.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert';
import { sendAdminNotification } from './email.ts';

Deno.test('Resend에 관리자 승인 링크를 담아 발송합니다', async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(input), init };
    return Response.json({ id: 'email-1' }, { status: 200 });
  }) as typeof fetch;

  await sendAdminNotification(
    { fetch: fakeFetch, apiKey: 'resend-secret', from: '가입 알림 <signup@example.com>' },
    {
      to: 'admin@example.com',
      approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
      requesterEmail: 'guest@example.com',
    },
  );

  assertEquals(captured?.url, 'https://api.resend.com/emails');
  assertEquals(captured?.init?.method, 'POST');
  assertEquals(new Headers(captured?.init?.headers).get('authorization'), 'Bearer resend-secret');
  assertEquals(JSON.parse(String(captured?.init?.body)), {
    from: '가입 알림 <signup@example.com>',
    to: ['admin@example.com'],
    subject: '회원가입 승인 요청',
    html:
      '<p>guest@example.com 님이 회원가입을 요청했습니다.</p>' +
      '<p><a href="https://lunch.example.com/admin/approve?token=abc">요청 검토하기</a></p>',
  });
});

Deno.test('Resend 오류 응답을 성공으로 처리하지 않습니다', async () => {
  const fakeFetch = (async () =>
    Response.json({ message: 'invalid api key' }, { status: 401 })) as typeof fetch;
  let message = '';
  try {
    await sendAdminNotification(
      { fetch: fakeFetch, apiKey: 'bad-key', from: 'signup@example.com' },
      {
        to: 'admin@example.com',
        approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
        requesterEmail: 'guest@example.com',
      },
    );
  } catch (error) {
    message = (error as Error).message;
  }
  assertEquals(message, 'Resend 이메일 발송에 실패했습니다: 401');
});
```

- [ ] **Step 2: 공유 유틸 테스트가 실패하는지 확인한다**

Run:

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto _shared/token.test.ts _shared/email.test.ts
```

Expected: `./token.ts`와 `./email.ts` 모듈을 찾을 수 없어 실패한다.

- [ ] **Step 3: 토큰과 Resend 최소 구현을 작성한다**

`supabase/functions/_shared/token.ts`:

```ts
export function generateApprovalToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

`supabase/functions/_shared/email.ts`:

```ts
export type EmailDeps = {
  fetch: typeof fetch;
  apiKey: string;
  from: string;
};

export async function sendAdminNotification(
  deps: EmailDeps,
  input: { to: string; approveUrl: string; requesterEmail: string },
): Promise<void> {
  const response = await deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: deps.from,
      to: [input.to],
      subject: '회원가입 승인 요청',
      html:
        `<p>${input.requesterEmail} 님이 회원가입을 요청했습니다.</p>` +
        `<p><a href="${input.approveUrl}">요청 검토하기</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend 이메일 발송에 실패했습니다: ${response.status}`);
  }
}
```

- [ ] **Step 4: 공유 유틸 테스트가 통과하는지 확인한다**

Run:

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto _shared/token.test.ts _shared/email.test.ts
```

Expected: `4 passed | 0 failed`.

- [ ] **Step 5: 공유 유틸을 커밋한다**

```bash
git add supabase/functions/_shared/token.ts supabase/functions/_shared/token.test.ts supabase/functions/_shared/email.ts supabase/functions/_shared/email.test.ts
git commit -m "feat: 승인 토큰과 Resend 발송 유틸 추가"
```

### Task 3: signup-request Edge Function

**Files:**
- Create: `supabase/functions/signup-request/index.ts`
- Test: `supabase/functions/signup-request/index.test.ts`

**Interfaces:**
- Consumes: `generateApprovalToken(): string`; `sendAdminNotification(deps, input): Promise<void>`; `SignupRequestDeps { countRecent(ip: string, email: string, since: string): Promise<{ ip: number; email: number }>; findPending(email: string): Promise<boolean>; userExists(email: string): Promise<boolean>; insert(input: SignupRequestInsert): Promise<void>; sendAdmin(input: { to: string; approveUrl: string; requesterEmail: string }): Promise<void>; generateToken(): string; now(): Date; adminEmail: string; siteUrl: string }`.
- Produces: `SignupRequestInsert { email: string; request_ip: string; token: string; status: 'pending'; expires_at: string }`; `createSignupRequestHandler(deps: SignupRequestDeps): (request: Request) => Promise<Response>`; `POST { email: string }`에 대해 `202 { message: string }`, `409`, `429`, `400`, `500`.

- [ ] **Step 1: handler의 실패 테스트를 작성한다**

`supabase/functions/signup-request/index.test.ts`에 `makeDeps()`를 두고 다음 핵심 테스트를 작성한다.

```ts
import { assertEquals } from 'jsr:@std/assert';
import {
  createSignupRequestHandler,
  type SignupRequestDeps,
  type SignupRequestInsert,
} from './index.ts';

function makeDeps(overrides: Partial<SignupRequestDeps> = {}): SignupRequestDeps {
  return {
    countRecent: async () => ({ ip: 0, email: 0 }),
    findPending: async () => false,
    userExists: async () => false,
    insert: async () => {},
    sendAdmin: async () => {},
    generateToken: () => 'a'.repeat(64),
    now: () => new Date('2026-07-23T00:00:00.000Z'),
    adminEmail: 'admin@example.com',
    siteUrl: 'https://lunch.example.com',
    ...overrides,
  };
}

function request(email = 'guest@example.com', ip = '203.0.113.10') {
  return new Request('https://edge.example.com/signup-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  });
}

Deno.test('IP 또는 이메일 최근 요청이 5건이면 차단합니다', async () => {
  for (const counts of [{ ip: 5, email: 0 }, { ip: 0, email: 5 }]) {
    let inserted = false;
    const response = await createSignupRequestHandler(
      makeDeps({
        countRecent: async () => counts,
        insert: async () => {
          inserted = true;
        },
      }),
    )(request());
    assertEquals(response.status, 429);
    assertEquals(inserted, false);
  }
});

Deno.test('pending 요청이 있으면 저장하거나 메일을 보내지 않습니다', async () => {
  let inserted = false;
  let mailed = false;
  const response = await createSignupRequestHandler(
    makeDeps({
      findPending: async () => true,
      insert: async () => {
        inserted = true;
      },
      sendAdmin: async () => {
        mailed = true;
      },
    }),
  )(request());
  assertEquals(response.status, 202);
  assertEquals(await response.json(), { message: '이미 요청됨' });
  assertEquals(inserted, false);
  assertEquals(mailed, false);
});

Deno.test('정상 요청을 3일 만료로 저장하고 관리자에게 승인 링크를 보냅니다', async () => {
  let row: SignupRequestInsert | undefined;
  let mail:
    | { to: string; approveUrl: string; requesterEmail: string }
    | undefined;
  const response = await createSignupRequestHandler(
    makeDeps({
      insert: async (input) => {
        row = input;
      },
      sendAdmin: async (input) => {
        mail = input;
      },
    }),
  )(request(' Guest@Example.com '));
  assertEquals(response.status, 202);
  assertEquals(row, {
    email: 'guest@example.com',
    request_ip: '203.0.113.10',
    token: 'a'.repeat(64),
    status: 'pending',
    expires_at: '2026-07-26T00:00:00.000Z',
  });
  assertEquals(mail, {
    to: 'admin@example.com',
    approveUrl: `https://lunch.example.com/admin/approve?token=${'a'.repeat(64)}`,
    requesterEmail: 'guest@example.com',
  });
});

Deno.test('이미 가입된 이메일은 중복 요청을 거부합니다', async () => {
  const response = await createSignupRequestHandler(
    makeDeps({ userExists: async () => true }),
  )(request());
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: '이미 가입된 이메일입니다.' });
});
```

- [ ] **Step 2: handler 테스트가 실패하는지 확인한다**

Run:

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto signup-request/index.test.ts
```

Expected: `./index.ts`를 찾을 수 없어 실패한다.

- [ ] **Step 3: 주입 가능한 handler와 운영 어댑터를 구현한다**

`supabase/functions/signup-request/index.ts`에는 아래 공개 타입과 순서의 handler를 작성한다. 운영 어댑터는 `createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)`를 사용하고, 최근 1시간(`created_at >= since`)의 `request_ip` 및 `email` count를 각각 조회하며 한도는 각 5건으로 고정한다.

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendAdminNotification } from '../_shared/email.ts';
import { generateApprovalToken } from '../_shared/token.ts';

export type SignupRequestInsert = {
  email: string;
  request_ip: string;
  token: string;
  status: 'pending';
  expires_at: string;
};
export type SignupRequestDeps = {
  countRecent(ip: string, email: string, since: string): Promise<{ ip: number; email: number }>;
  findPending(email: string): Promise<boolean>;
  userExists(email: string): Promise<boolean>;
  insert(input: SignupRequestInsert): Promise<void>;
  sendAdmin(input: { to: string; approveUrl: string; requesterEmail: string }): Promise<void>;
  generateToken(): string;
  now(): Date;
  adminEmail: string;
  siteUrl: string;
};

const LIMIT_PER_HOUR = 5;

export function createSignupRequestHandler(deps: SignupRequestDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST')
      return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
    let body: { email?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return Response.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const now = deps.now();
    // 요금폭탄 주의: 스팸 요청이 Resend 발송·요금으로 직결
    const counts = await deps.countRecent(
      ip,
      email,
      new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    );
    if (counts.ip >= LIMIT_PER_HOUR || counts.email >= LIMIT_PER_HOUR)
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });
    if (await deps.userExists(email))
      return Response.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
    if (await deps.findPending(email))
      return Response.json({ message: '이미 요청됨' }, { status: 202 });

    const token = deps.generateToken();
    await deps.insert({
      email,
      request_ip: ip,
      token,
      status: 'pending',
      expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await deps.sendAdmin({
      to: deps.adminEmail,
      approveUrl: `${deps.siteUrl}/admin/approve?token=${encodeURIComponent(token)}`,
      requesterEmail: email,
    });
    return Response.json({ message: '승인되면 메일로 안내됩니다' }, { status: 202 });
  };
}
```

같은 파일의 `if (import.meta.main)` 블록에서 다음 운영 매핑을 완성한다.

```ts
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const deps: SignupRequestDeps = {
  countRecent: async (ip, email, since) => {
    const [ipResult, emailResult] = await Promise.all([
      supabase.from('signup_requests').select('id', { count: 'exact', head: true })
        .eq('request_ip', ip).gte('created_at', since),
      supabase.from('signup_requests').select('id', { count: 'exact', head: true })
        .eq('email', email).gte('created_at', since),
    ]);
    if (ipResult.error) throw ipResult.error;
    if (emailResult.error) throw emailResult.error;
    return { ip: ipResult.count ?? 0, email: emailResult.count ?? 0 };
  },
  findPending: async (email) => {
    const { count, error } = await supabase.from('signup_requests')
      .select('id', { count: 'exact', head: true }).eq('email', email).eq('status', 'pending');
    if (error) throw error;
    return (count ?? 0) > 0;
  },
  userExists: async (email) => {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    return data.users.some((user) => user.email?.toLowerCase() === email);
  },
  insert: async (input) => {
    const { error } = await supabase.from('signup_requests').insert(input);
    if (error) throw error;
  },
  sendAdmin: (input) => sendAdminNotification(
    {
      fetch,
      apiKey: Deno.env.get('RESEND_API_KEY')!,
      from: Deno.env.get('RESEND_FROM')!,
    },
    input,
  ),
  generateToken: generateApprovalToken,
  now: () => new Date(),
  adminEmail: Deno.env.get('ADMIN_EMAIL')!,
  siteUrl: Deno.env.get('SITE_URL')!,
};
Deno.serve(createSignupRequestHandler(deps));
```

- [ ] **Step 4: signup-request 테스트가 통과하는지 확인한다**

Run:

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto signup-request/index.test.ts
```

Expected: `4 passed | 0 failed`; 모킹된 테스트 중 실제 Resend 발송이나 Auth 사용자 생성은 없다.

- [ ] **Step 5: signup-request를 커밋한다**

```bash
git add supabase/functions/signup-request/index.ts supabase/functions/signup-request/index.test.ts
git commit -m "feat: 승인 기반 회원가입 요청 함수 추가"
```

### Task 4: approve-signup Edge Function

**Files:**
- Create: `supabase/functions/approve-signup/index.ts`
- Test: `supabase/functions/approve-signup/index.test.ts`

**Interfaces:**
- Consumes: `ApproveSignupDeps { findRequest(token: string): Promise<SignupRequest | null>; userExists(email: string): Promise<boolean>; invite(email: string, redirectTo: string): Promise<void>; updateStatus(id: string, from: 'pending', to: 'approved' | 'rejected'): Promise<boolean>; now(): Date; siteUrl: string }`.
- Produces: `SignupRequest { id: string; email: string; status: 'pending' | 'approved' | 'rejected'; expires_at: string }`; `createApproveSignupHandler(deps: ApproveSignupDeps): (request: Request) => Promise<Response>`; GET `{ email, status }`; POST `{ token, action: 'approve' | 'reject' }`.

- [ ] **Step 1: 조회·승인·거절의 실패 테스트를 작성한다**

`supabase/functions/approve-signup/index.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert';
import { createApproveSignupHandler, type ApproveSignupDeps } from './index.ts';

const pending = {
  id: 'request-1',
  email: 'guest@example.com',
  status: 'pending' as const,
  expires_at: '2026-07-26T00:00:00.000Z',
};
function makeDeps(overrides: Partial<ApproveSignupDeps> = {}): ApproveSignupDeps {
  return {
    findRequest: async () => pending,
    userExists: async () => false,
    invite: async () => {},
    updateStatus: async () => true,
    now: () => new Date('2026-07-23T00:00:00.000Z'),
    siteUrl: 'https://lunch.example.com',
    ...overrides,
  };
}
function post(action: 'approve' | 'reject') {
  return new Request('https://edge.example.com/approve-signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'token-1', action }),
  });
}

Deno.test('GET은 유효한 토큰의 이메일과 상태를 반환합니다', async () => {
  const response = await createApproveSignupHandler(makeDeps())(
    new Request('https://edge.example.com/approve-signup?token=token-1'),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { email: 'guest@example.com', status: 'pending' });
});

Deno.test('없거나 만료된 토큰을 거부합니다', async () => {
  const cases = [
    makeDeps({ findRequest: async () => null }),
    makeDeps({ findRequest: async () => ({ ...pending, expires_at: '2026-07-22T00:00:00.000Z' }) }),
  ];
  for (const deps of cases) {
    const response = await createApproveSignupHandler(deps)(
      new Request('https://edge.example.com/approve-signup?token=bad'),
    );
    assertEquals(response.status, 410);
  }
});

Deno.test('approve는 초대 후 상태를 approved로 갱신합니다', async () => {
  const calls: string[] = [];
  const response = await createApproveSignupHandler(
    makeDeps({
      invite: async (email, redirectTo) => calls.push(`${email}|${redirectTo}`),
      updateStatus: async (id, from, to) => {
        calls.push(`${id}|${from}|${to}`);
        return true;
      },
    }),
  )(post('approve'));
  assertEquals(response.status, 200);
  assertEquals(calls, [
    'guest@example.com|https://lunch.example.com/set-password',
    'request-1|pending|approved',
  ]);
});

Deno.test('이미 가입된 사용자는 초대 없이 approved로 처리하고 사실을 반환합니다', async () => {
  let invited = false;
  const response = await createApproveSignupHandler(
    makeDeps({
      userExists: async () => true,
      invite: async () => {
        invited = true;
      },
    }),
  )(post('approve'));
  assertEquals(invited, false);
  assertEquals(await response.json(), { status: 'approved', alreadyRegistered: true });
});

Deno.test('reject는 초대 없이 rejected로 갱신합니다', async () => {
  let transition = '';
  const response = await createApproveSignupHandler(
    makeDeps({
      invite: async () => {
        throw new Error('reject에서 호출되면 안 됩니다');
      },
      updateStatus: async (_id, from, to) => {
        transition = `${from}|${to}`;
        return true;
      },
    }),
  )(post('reject'));
  assertEquals(response.status, 200);
  assertEquals(transition, 'pending|rejected');
  assertEquals(await response.json(), { status: 'rejected' });
});
```

- [ ] **Step 2: approve-signup 테스트가 실패하는지 확인한다**

Run:

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto approve-signup/index.test.ts
```

Expected: `./index.ts`를 찾을 수 없어 실패한다.

- [ ] **Step 3: 토큰 재검증과 1회용 상태 전이를 구현한다**

`supabase/functions/approve-signup/index.ts`의 handler 핵심을 다음과 같이 작성한다. `updateStatus`는 운영 어댑터에서 반드시 `.eq('id', id).eq('status', 'pending').select('id').maybeSingle()`로 조건부 갱신하여 동시에 재사용된 토큰 중 하나만 성공하게 한다.

```ts
export type SignupRequest = {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  expires_at: string;
};
export type ApproveSignupDeps = {
  findRequest(token: string): Promise<SignupRequest | null>;
  userExists(email: string): Promise<boolean>;
  invite(email: string, redirectTo: string): Promise<void>;
  updateStatus(id: string, from: 'pending', to: 'approved' | 'rejected'): Promise<boolean>;
  now(): Date;
  siteUrl: string;
};

function valid(row: SignupRequest | null, now: Date): row is SignupRequest {
  return Boolean(row && row.status === 'pending' && new Date(row.expires_at) > now);
}

export function createApproveSignupHandler(deps: ApproveSignupDeps) {
  return async (request: Request): Promise<Response> => {
    let token = new URL(request.url).searchParams.get('token') ?? '';
    let action: 'approve' | 'reject' | undefined;
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null) as
        | { token?: unknown; action?: unknown }
        | null;
      token = typeof body?.token === 'string' ? body.token : '';
      action = body?.action === 'approve' || body?.action === 'reject' ? body.action : undefined;
      if (!action)
        return Response.json({ error: '승인 동작이 올바르지 않습니다.' }, { status: 400 });
    } else if (request.method !== 'GET') {
      return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
    }
    const row = token ? await deps.findRequest(token) : null;
    if (!valid(row, deps.now()))
      return Response.json({ error: '만료되었거나 유효하지 않은 요청입니다.' }, { status: 410 });
    if (request.method === 'GET')
      return Response.json({ email: row.email, status: row.status });

    const next = action === 'approve' ? 'approved' : 'rejected';
    const alreadyRegistered = action === 'approve' && await deps.userExists(row.email);
    if (action === 'approve' && !alreadyRegistered)
      await deps.invite(row.email, `${deps.siteUrl}/set-password`);
    if (!(await deps.updateStatus(row.id, 'pending', next)))
      return Response.json({ error: '이미 처리된 요청입니다.' }, { status: 409 });
    return Response.json(
      action === 'approve'
        ? { status: 'approved', alreadyRegistered }
        : { status: 'rejected' },
    );
  };
}
```

같은 파일의 운영 어댑터는 `jsr:@supabase/supabase-js@2` service-role client를 만들고 다음과 매핑한다.

```ts
findRequest: async (token) => {
  const { data, error } = await supabase.from('signup_requests')
    .select('id,email,status,expires_at').eq('token', token).maybeSingle();
  if (error) throw error;
  return data;
},
userExists: async (email) => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.some((user) => user.email?.toLowerCase() === email);
},
invite: async (email, redirectTo) => {
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw error;
},
updateStatus: async (id, from, to) => {
  const { data, error } = await supabase.from('signup_requests').update({ status: to })
    .eq('id', id).eq('status', from).select('id').maybeSingle();
  if (error) throw error;
  return data !== null;
},
now: () => new Date(),
siteUrl: Deno.env.get('SITE_URL')!,
```

- [ ] **Step 4: approve-signup 테스트가 통과하는지 확인한다**

Run:

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto approve-signup/index.test.ts
```

Expected: `5 passed | 0 failed`; invite와 DB는 모두 주입된 모킹만 호출한다.

- [ ] **Step 5: approve-signup을 커밋한다**

```bash
git add supabase/functions/approve-signup/index.ts supabase/functions/approve-signup/index.test.ts
git commit -m "feat: 회원가입 승인과 거절 함수 추가"
```

### Task 5: 로그인 화면 회원가입 요청 폼

**Files:**
- Modify: `app/login/page.tsx`
- Test: `app/login/page.test.tsx`

**Interfaces:**
- Consumes: `supabase.auth.signInWithPassword({ email, password })`; `supabase.functions.invoke('signup-request', { body: { email: string } })`.
- Produces: 기존 로그인 UI와 독립된 “회원가입 요청 이메일” 폼; 성공 `role="status"` 문구 `승인되면 메일로 안내됩니다`; 실패 `role="alert"`.

- [ ] **Step 1: 기존 모킹을 확장하고 가입 요청 실패 테스트를 추가한다**

`app/login/page.test.tsx`의 Supabase 모킹과 참조를 다음과 같이 확장한다.

```tsx
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));
const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
```

`beforeEach`에 `invoke.mockReset();`을 추가하고 다음 테스트를 `describe('로그인')` 안에 추가한다.

```tsx
it('회원가입 요청 성공 안내를 표시합니다', async () => {
  invoke.mockResolvedValue({ data: { message: '승인되면 메일로 안내됩니다' }, error: null });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('회원가입 요청 이메일'), {
    target: { value: 'guest@example.com' },
  });
  fireEvent.submit(screen.getByRole('button', { name: '회원가입 요청' }).closest('form')!);
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('승인되면 메일로 안내됩니다'),
  );
  expect(invoke).toHaveBeenCalledWith('signup-request', {
    body: { email: 'guest@example.com' },
  });
});

it('회원가입 요청 오류를 alert로 표시합니다', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: '요청 한도를 초과했습니다.' } });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('회원가입 요청 이메일'), {
    target: { value: 'guest@example.com' },
  });
  fireEvent.submit(screen.getByRole('button', { name: '회원가입 요청' }).closest('form')!);
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('요청 한도를 초과했습니다.'),
  );
});
```

- [ ] **Step 2: 프론트엔드 테스트가 새 케이스에서 실패하는지 확인한다**

Run:

```bash
npm test -- app/login/page.test.tsx
```

Expected: `회원가입 요청 이메일` 라벨과 `회원가입 요청` 버튼을 찾지 못해 새 테스트 2개가 실패하고 기존 로그인 테스트는 통과한다.

- [ ] **Step 3: 기존 로그인 로직을 보존하고 요청 폼을 최소 구현한다**

`app/login/page.tsx`에 요청 전용 상태와 handler를 추가한다.

```tsx
const [requestMessage, setRequestMessage] = useState('');
const [requestError, setRequestError] = useState('');
const [requestLoading, setRequestLoading] = useState(false);

async function requestSignup(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setRequestLoading(true);
  setRequestMessage('');
  setRequestError('');
  const data = new FormData(e.currentTarget);
  const { data: result, error } = await supabase.functions.invoke('signup-request', {
    body: { email: String(data.get('signup-email')) },
  });
  if (error) setRequestError(error.message);
  else setRequestMessage(result?.message ?? '승인되면 메일로 안내됩니다');
  setRequestLoading(false);
}
```

기존 로그인 `</form>` 뒤에 다음 폼을 추가한다.

```tsx
<hr />
<h2>회원가입 요청</h2>
<form className={styles.form} onSubmit={requestSignup}>
  <label className={styles.field} htmlFor="signup-email">
    회원가입 요청 이메일
    <input
      className={styles.input}
      id="signup-email"
      name="signup-email"
      type="email"
      autoComplete="email"
      required
    />
  </label>
  <button
    className={styles.button}
    type="submit"
    disabled={requestLoading}
    aria-busy={requestLoading}
  >
    {requestLoading ? '요청 중…' : '회원가입 요청'}
  </button>
  {requestMessage && <p role="status">{requestMessage}</p>}
  {requestError && <p className={styles.error} role="alert">{requestError}</p>}
</form>
```

- [ ] **Step 4: 로그인 회귀와 품질 검증을 모두 통과시킨다**

Run:

```bash
npm test -- app/login/page.test.tsx && npm run typecheck && npm run lint
```

Expected: `app/login/page.test.tsx`의 기존 3개와 신규 2개 테스트가 모두 통과하고, TypeScript 오류와 ESLint 오류가 없다.

- [ ] **Step 5: 로그인 화면 변경을 커밋한다**

```bash
git add app/login/page.tsx app/login/page.test.tsx
git commit -m "feat: 로그인 화면에 회원가입 요청 폼 추가"
```

### Task 6: 관리자 승인 페이지

**Files:**
- Create: `app/admin/approve/page.tsx`
- Test: `app/admin/approve/page.test.tsx`

**Interfaces:**
- Consumes: `useSearchParams().get('token')`; `fetch(<SUPABASE_URL>/functions/v1/approve-signup?token=..., { method: 'GET', headers: { apikey } })`; 동일 URL의 `POST { token, action }`. 공개 anon key만 사용하며 service role은 사용하지 않는다.
- Produces: `ApprovePage(): JSX.Element`; 요청 이메일·상태·승인/거절 버튼; 처리 결과 또는 `role="alert"` 오류.

- [ ] **Step 1: 승인 페이지 실패 테스트를 작성한다**

`app/admin/approve/page.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=token-1'),
}));
import ApprovePage from './page';

describe('관리자 회원가입 승인', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('요청 이메일과 상태를 표시합니다', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ email: 'guest@example.com', status: 'pending' }),
    );
    render(<ApprovePage />);
    expect(await screen.findByText('guest@example.com')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it.each([
    ['승인', 'approve', '승인 완료'],
    ['거절', 'reject', '거절 완료'],
  ])('%s 버튼이 POST 후 결과를 표시합니다', async (button, action, result) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ email: 'guest@example.com', status: 'pending' }))
      .mockResolvedValueOnce(
        Response.json({ status: action === 'approve' ? 'approved' : 'rejected' }),
      );
    render(<ApprovePage />);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(result));
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', action }),
    });
  });

  it('만료·무효 토큰 안내를 표시합니다', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: '만료되었거나 유효하지 않은 요청입니다.' }, { status: 410 }),
    );
    render(<ApprovePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '만료되었거나 유효하지 않은 요청입니다.',
    );
  });
});
```

- [ ] **Step 2: 승인 페이지 테스트가 실패하는지 확인한다**

Run:

```bash
npm test -- app/admin/approve/page.test.tsx
```

Expected: `./page` 모듈을 찾을 수 없어 실패한다.

- [ ] **Step 3: GET 조회와 POST 처리를 구현한다**

`app/admin/approve/page.tsx`를 클라이언트 컴포넌트로 만들고 다음 공개 동작을 구현한다.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const functionUrl =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/approve-signup`;
const headers = {
  apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  'Content-Type': 'application/json',
};

export default function ApprovePage() {
  const token = useSearchParams().get('token') ?? '';
  const [request, setRequest] = useState<{ email: string; status: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const response = await fetch(`${functionUrl}?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers,
      });
      const body = await response.json();
      if (!response.ok) setError(body.error);
      else setRequest(body);
    })();
  }, [token]);

  async function decide(action: 'approve' | 'reject') {
    setError('');
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token, action }),
    });
    const body = await response.json();
    if (!response.ok) return setError(body.error);
    if (body.alreadyRegistered) setMessage('이미 가입된 사용자입니다.');
    else setMessage(action === 'approve' ? '승인 완료' : '거절 완료');
  }

  return (
    <main>
      <h1>회원가입 요청 검토</h1>
      {request && (
        <>
          <p>{request.email}</p>
          <p>{request.status}</p>
          <button type="button" onClick={() => void decide('approve')}>승인</button>
          <button type="button" onClick={() => void decide('reject')}>거절</button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 4: 승인 페이지와 전체 프론트 품질 검증을 통과시킨다**

Run:

```bash
npm test -- app/admin/approve/page.test.tsx && npm run typecheck && npm run lint
```

Expected: 승인 페이지 테스트 4건이 통과하고 TypeScript와 ESLint 오류가 없다.

- [ ] **Step 5: 승인 페이지를 커밋한다**

```bash
git add app/admin/approve/page.tsx app/admin/approve/page.test.tsx
git commit -m "feat: 관리자 회원가입 승인 페이지 추가"
```

### Task 7: 비밀번호 설정 페이지

**Files:**
- Create: `app/set-password/page.tsx`
- Test: `app/set-password/page.test.tsx`

**Interfaces:**
- Consumes: `supabase.auth.getSession(): Promise<{ data: { session: Session | null } }>`; `supabase.auth.updateUser({ password: string })`.
- Produces: `SetPasswordPage(): JSX.Element`; 세션 유무 안내, 비밀번호 폼, 성공 `role="status"`, 실패 `role="alert"`.

- [ ] **Step 1: 세션과 비밀번호 설정의 실패 테스트를 작성한다**

`app/set-password/page.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn(), updateUser: vi.fn() },
  },
}));
import { supabase } from '../../lib/supabaseClient';
import SetPasswordPage from './page';

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const updateUser = supabase.auth.updateUser as ReturnType<typeof vi.fn>;

describe('비밀번호 설정', () => {
  beforeEach(() => {
    getSession.mockReset();
    updateUser.mockReset();
  });

  it('초대 세션이 없으면 잘못된 진입을 안내합니다', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<SetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '유효한 초대 링크로 접속해 주세요.',
    );
  });

  it('비밀번호 설정 성공 후 로그인 안내를 표시합니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: null });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'strong-password-1' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '비밀번호를 설정했습니다. 이제 로그인할 수 있습니다.',
      ),
    );
    expect(updateUser).toHaveBeenCalledWith({ password: 'strong-password-1' });
  });

  it('비밀번호 설정 오류를 alert로 표시합니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: { message: '비밀번호가 너무 짧습니다.' } });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('비밀번호가 너무 짧습니다.'),
    );
  });
});
```

- [ ] **Step 2: 비밀번호 설정 페이지 테스트가 실패하는지 확인한다**

Run:

```bash
npm test -- app/set-password/page.test.tsx
```

Expected: `./page` 모듈을 찾을 수 없어 실패한다.

- [ ] **Step 3: 초대 세션 검사와 비밀번호 변경을 구현한다**

`app/set-password/page.tsx`:

```tsx
'use client';
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setReady(true);
    });
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage('');
    setError('');
    const password = String(new FormData(e.currentTarget).get('password'));
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setMessage('비밀번호를 설정했습니다. 이제 로그인할 수 있습니다.');
  }

  if (!ready) return <main><p>초대 정보를 확인하는 중입니다.</p></main>;
  if (!hasSession)
    return <main><p role="alert">유효한 초대 링크로 접속해 주세요.</p></main>;

  return (
    <main>
      <h1>비밀번호 설정</h1>
      <form onSubmit={submit}>
        <label htmlFor="password">
          새 비밀번호
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit">비밀번호 설정</button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 4: 비밀번호 설정 페이지와 전체 프론트 품질 검증을 통과시킨다**

Run:

```bash
npm test -- app/set-password/page.test.tsx && npm run typecheck && npm run lint
```

Expected: 비밀번호 설정 테스트 3건이 통과하고 TypeScript와 ESLint 오류가 없다.

- [ ] **Step 5: 비밀번호 설정 페이지를 커밋한다**

```bash
git add app/set-password/page.tsx app/set-password/page.test.tsx
git commit -m "feat: 초대 사용자 비밀번호 설정 페이지 추가"
```

## 운영 설정 체크리스트

- [ ] Supabase Auth SMTP를 Resend로 설정한다.
- [ ] Edge Function 시크릿 `RESEND_API_KEY`를 설정한다.
- [ ] Edge Function 시크릿 `ADMIN_EMAIL`을 `jindevst@gmail.com`으로 설정한다.
- [ ] Edge Function 시크릿 `SITE_URL`을 실제 배포 도메인으로 설정한다.
- [ ] Edge Function 시크릿 `RESEND_FROM`을 Resend에서 검증한 발신 주소로 설정한다.
- [ ] Supabase Auth redirect 허용 URL에 배포 도메인의 `/set-password` URL을 추가한다.
- [ ] Resend 발신 도메인과 발신 주소의 검증 상태를 확인한다.
- [ ] 다음 명령으로 마이그레이션과 Edge Function을 배포한다.

```bash
supabase db push
supabase functions deploy signup-request approve-signup
```

- [ ] 운영 환경에서 관리자 알림 링크의 도메인, 초대 메일의 `/set-password` redirect, 만료·처리 완료 토큰의 재사용 차단을 각각 확인한다.

## 최종 검증

```bash
supabase db reset && supabase test db
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto
cd ../.. && npm test && npm run typecheck && npm run lint
```

Expected: DB, Deno, Vitest 테스트가 모두 `0 failed`로 종료하고 TypeScript 및 ESLint 오류가 없다. 브라우저 코드 검색에서 `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, `inviteUserByEmail`이 발견되지 않으며, `signup_requests`의 anon/authenticated 직접 접근은 계속 `42501`로 거부된다.

## 근거 스펙

- [관리자 승인 기반 회원가입 설계 스펙](../specs/2026-07-23-signup-approval-design.md)
