import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import {
  createSignupRequestHandler,
  DuplicatePendingRequestError,
  type SignupRequestDeps,
  type SignupRequestInsert,
} from './index.ts';

function makeDeps(overrides: Partial<SignupRequestDeps> = {}): SignupRequestDeps {
  return {
    logAttempt: async () => {},
    countRecent: async () => ({ ip: 0, email: 0 }),
    findPending: async () => false,
    insert: async () => {},
    rollbackInsert: async () => {},
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

Deno.test('rate limit 판단 전에 시도 자체를 기록합니다(저장 없이 끝나는 요청도 한도에 반영)', async () => {
  let loggedWith: [string, string] | undefined;
  const response = await createSignupRequestHandler(
    makeDeps({
      logAttempt: async (ip, email) => {
        loggedWith = [ip, email];
      },
      countRecent: async () => ({ ip: 5, email: 0 }),
    }),
  )(request(' Guest@Example.com '));
  assertEquals(response.status, 429);
  assertEquals(loggedWith, ['203.0.113.10', 'guest@example.com']);
});

Deno.test('countRecent는 정규화된 이메일, IP, 1시간 전 시각으로 호출됩니다', async () => {
  let calledWith: [string, string, string] | undefined;
  await createSignupRequestHandler(
    makeDeps({
      countRecent: async (ip, email, since) => {
        calledWith = [ip, email, since];
        return { ip: 0, email: 0 };
      },
    }),
  )(request(' Guest@Example.com ', '203.0.113.10'));
  assertEquals(calledWith, [
    '203.0.113.10',
    'guest@example.com',
    '2026-07-22T23:00:00.000Z',
  ]);
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
  assertEquals(await response.json(), {
    message: '요청이 접수되었습니다. 승인되면 메일로 안내됩니다.',
  });
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

Deno.test('findPending 체크를 통과한 경합 요청도 unique index 위반이면 동일한 접수 응답을 돌려줍니다', async () => {
  let mailed = false;
  const response = await createSignupRequestHandler(
    makeDeps({
      insert: async () => {
        throw new DuplicatePendingRequestError();
      },
      sendAdmin: async () => {
        mailed = true;
      },
    }),
  )(request());
  assertEquals(response.status, 202);
  assertEquals(await response.json(), {
    message: '요청이 접수되었습니다. 승인되면 메일로 안내됩니다.',
  });
  assertEquals(mailed, false);
});

Deno.test('신규/중복 pending/경합 요청 모두 동일한 응답이라 이메일 가입 여부를 알아낼 수 없습니다', async () => {
  const newResponse = await createSignupRequestHandler(makeDeps())(request());
  const duplicatePendingResponse = await createSignupRequestHandler(
    makeDeps({ findPending: async () => true }),
  )(request());
  const racedResponse = await createSignupRequestHandler(
    makeDeps({
      insert: async () => {
        throw new DuplicatePendingRequestError();
      },
    }),
  )(request());

  const bodies = await Promise.all(
    [newResponse, duplicatePendingResponse, racedResponse].map((response) => response.json()),
  );
  assertEquals(newResponse.status, 202);
  assertEquals(duplicatePendingResponse.status, 202);
  assertEquals(racedResponse.status, 202);
  assertEquals(bodies[0], bodies[1]);
  assertEquals(bodies[1], bodies[2]);
});

Deno.test('메일 발송에 실패하면 방금 만든 pending 행을 롤백하고 오류를 반환합니다', async () => {
  let rolledBackToken: string | undefined;
  const response = await createSignupRequestHandler(
    makeDeps({
      sendAdmin: async () => {
        throw new Error('Resend API 키 sk_live_secret 노출 안됨 확인용 내부 오류');
      },
      rollbackInsert: async (token) => {
        rolledBackToken = token;
      },
    }),
  )(request());
  assertEquals(rolledBackToken, 'a'.repeat(64));
  assertEquals(response.status, 500);
  const responseBody = await response.text();
  assertStringIncludes(responseBody, '요청을 처리하지 못했습니다.');
  assertEquals(responseBody.includes('sk_live_secret'), false);
});

Deno.test('DB 조회 중 예외가 나면 비밀 정보 없이 500을 반환합니다', async () => {
  const response = await createSignupRequestHandler(
    makeDeps({
      countRecent: async () => {
        throw new Error('postgresql://user:supersecret@internal-db:5432/app');
      },
    }),
  )(request());
  assertEquals(response.status, 500);
  const responseBody = await response.text();
  assertStringIncludes(responseBody, '요청을 처리하지 못했습니다.');
  assertEquals(responseBody.includes('supersecret'), false);
});
