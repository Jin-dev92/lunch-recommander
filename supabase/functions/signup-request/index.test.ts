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
