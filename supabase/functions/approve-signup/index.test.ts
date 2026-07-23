import { assertEquals } from 'jsr:@std/assert';
import { createApproveSignupHandler, type ApproveSignupDeps, type SignupRequest } from './index.ts';

const pending = {
  id: 'request-1',
  email: 'guest@example.com',
  status: 'pending' as const,
  expires_at: '2026-07-26T00:00:00.000Z',
};
function makeDeps(overrides: Partial<ApproveSignupDeps> = {}): ApproveSignupDeps {
  return {
    findRequest: async () => pending,
    invite: async () => ({ alreadyRegistered: false }),
    updateStatus: async () => true,
    now: () => new Date('2026-07-23T00:00:00.000Z'),
    siteUrl: 'https://lunch.example.com',
    ...overrides,
  };
}
function post(action: 'approve' | 'reject' | 'info', token = 'token-1') {
  return new Request('https://edge.example.com/approve-signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, action }),
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

Deno.test('POST action:info는 유효한 토큰의 이메일과 상태를 반환하고 상태를 바꾸지 않습니다', async () => {
  let updated = false;
  const response = await createApproveSignupHandler(
    makeDeps({ updateStatus: async () => { updated = true; return true; } }),
  )(post('info'));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { email: 'guest@example.com', status: 'pending' });
  assertEquals(updated, false);
});

Deno.test('POST action:info는 없거나 만료된 토큰을 거부합니다', async () => {
  const cases = [
    makeDeps({ findRequest: async () => null }),
    makeDeps({ findRequest: async () => ({ ...pending, expires_at: '2026-07-22T00:00:00.000Z' }) }),
  ];
  for (const deps of cases) {
    const response = await createApproveSignupHandler(deps)(post('info', 'bad'));
    assertEquals(response.status, 410);
  }
});

Deno.test('이미 처리된(approved/rejected) 토큰은 GET/POST 모두 410으로 거부합니다', async () => {
  for (const status of ['approved', 'rejected'] as const) {
    const deps = makeDeps({ findRequest: async () => ({ ...pending, status }) });
    const getResponse = await createApproveSignupHandler(deps)(
      new Request('https://edge.example.com/approve-signup?token=token-1'),
    );
    assertEquals(getResponse.status, 410);
    const postResponse = await createApproveSignupHandler(deps)(post('approve'));
    assertEquals(postResponse.status, 410);
  }
});

Deno.test('approve는 상태를 먼저 선점한 뒤 초대를 보냅니다', async () => {
  const calls: string[] = [];
  const response = await createApproveSignupHandler(
    makeDeps({
      invite: async (email, redirectTo) => {
        calls.push(`invite:${email}|${redirectTo}`);
        return { alreadyRegistered: false };
      },
      updateStatus: async (id, from, to) => {
        calls.push(`status:${id}|${from}|${to}`);
        return true;
      },
    }),
  )(post('approve'));
  assertEquals(response.status, 200);
  assertEquals(calls, [
    'status:request-1|pending|approved',
    'invite:guest@example.com|https://lunch.example.com/set-password',
  ]);
});

Deno.test('이미 가입된 사용자는 invite 결과로 alreadyRegistered를 판단합니다', async () => {
  let invited = false;
  const response = await createApproveSignupHandler(
    makeDeps({
      invite: async () => {
        invited = true;
        return { alreadyRegistered: true };
      },
    }),
  )(post('approve'));
  assertEquals(invited, true);
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

Deno.test('이미 처리된 토큰의 재사용(선점 실패)은 초대 없이 409를 반환합니다', async () => {
  let invited = false;
  const response = await createApproveSignupHandler(
    makeDeps({
      updateStatus: async () => false,
      invite: async () => {
        invited = true;
        return { alreadyRegistered: false };
      },
    }),
  )(post('approve'));
  assertEquals(response.status, 409);
  assertEquals(invited, false);
});

Deno.test('동시 approve 요청은 선점에 성공한 하나만 초대를 보냅니다', async () => {
  let status: SignupRequest['status'] = 'pending';
  let inviteCount = 0;
  const deps = makeDeps({
    findRequest: async () => ({ ...pending, status }),
    // 실제 DB의 "UPDATE ... WHERE status = from" 조건부 갱신을 흉내낸다. 이 함수 본문에는
    // await 지점이 없으므로 자바스크립트 런투컴플리션 특성상 이 비교+대입이 원자적으로 실행된다.
    updateStatus: async (_id, from, to) => {
      if (status !== from) return false;
      status = to;
      return true;
    },
    invite: async () => {
      inviteCount++;
      return { alreadyRegistered: false };
    },
  });
  const handler = createApproveSignupHandler(deps);
  const [first, second] = await Promise.all([handler(post('approve')), handler(post('approve'))]);
  const statuses = [first.status, second.status].sort();
  assertEquals(statuses, [200, 409]);
  assertEquals(inviteCount, 1);
});

Deno.test('초대 실패 시 상태를 pending으로 되돌리고 500을 반환합니다(토큰 소진 방지)', async () => {
  const calls: string[] = [];
  const response = await createApproveSignupHandler(
    makeDeps({
      invite: async () => {
        throw new Error('메일 발송 실패: service_role secret-leak');
      },
      updateStatus: async (id, from, to) => {
        calls.push(`${from}->${to}`);
        return true;
      },
    }),
  )(post('approve'));
  assertEquals(response.status, 500);
  assertEquals(calls, ['pending->approved', 'approved->pending']);
  assertEquals(await response.json(), { error: '요청을 처리하지 못했습니다.' });
});

Deno.test('DB 오류는 비밀정보 노출 없이 500으로 감싼다', async () => {
  const cases = [
    makeDeps({ findRequest: async () => { throw new Error('service_role key leaked-secret'); } }),
    makeDeps({ updateStatus: async () => { throw new Error('db-connection secret-leak'); } }),
    makeDeps({ invite: async () => { throw new Error('smtp-credential secret-leak'); } }),
  ];
  for (const deps of cases) {
    const response = await createApproveSignupHandler(deps)(post('approve'));
    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body, { error: '요청을 처리하지 못했습니다.' });
  }
});
