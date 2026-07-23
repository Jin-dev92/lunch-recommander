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

Deno.test('이미 처리된 토큰의 재사용(동시 전환 실패)은 409를 반환합니다', async () => {
  const response = await createApproveSignupHandler(
    makeDeps({ updateStatus: async () => false }),
  )(post('approve'));
  assertEquals(response.status, 409);
});

Deno.test('DB 오류는 비밀정보 노출 없이 500으로 감싼다', async () => {
  const response = await createApproveSignupHandler(
    makeDeps({ findRequest: async () => { throw new Error('service_role key leaked-secret'); } }),
  )(new Request('https://edge.example.com/approve-signup?token=token-1'));
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body, { error: '요청을 처리하지 못했습니다.' });
});
