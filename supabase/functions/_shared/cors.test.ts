import { assertEquals } from 'jsr:@std/assert';
import { withCors } from './cors.ts';

const ok = withCors(async () => Response.json({ ok: true }, { status: 200 }));

Deno.test('OPTIONS 프리플라이트에 핸들러를 타지 않고 204로 답합니다', async () => {
  let handlerCalled = false;
  const handler = withCors(async () => {
    handlerCalled = true;
    return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
  });

  const response = await handler(new Request('https://edge.example.com/fn', { method: 'OPTIONS' }));

  assertEquals(response.status, 204);
  assertEquals(response.headers.get('access-control-allow-origin'), '*');
  // 프리플라이트가 405로 떨어지면 브라우저가 본 요청을 막는다. 핸들러까지 가면 안 된다.
  assertEquals(handlerCalled, false);
});

Deno.test('프리플라이트 응답이 요청 헤더와 메서드를 허용합니다', async () => {
  const response = await ok(new Request('https://edge.example.com/fn', { method: 'OPTIONS' }));
  const allowHeaders = response.headers.get('access-control-allow-headers') ?? '';
  assertEquals(allowHeaders.includes('content-type'), true);
  assertEquals(allowHeaders.includes('authorization'), true);
  assertEquals((response.headers.get('access-control-allow-methods') ?? '').includes('POST'), true);
});

Deno.test('정상 응답에도 CORS 헤더를 붙이고 본문과 상태를 보존합니다', async () => {
  const response = await ok(new Request('https://edge.example.com/fn', { method: 'POST' }));

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('access-control-allow-origin'), '*');
  assertEquals(await response.json(), { ok: true });
});

Deno.test('오류 응답에도 CORS 헤더를 붙입니다', async () => {
  const handler = withCors(async () => Response.json({ error: '실패' }, { status: 500 }));

  const response = await handler(new Request('https://edge.example.com/fn', { method: 'POST' }));

  // 헤더가 없으면 브라우저가 오류 본문을 읽지 못해 원인 불명의 CORS 오류로 보인다.
  assertEquals(response.status, 500);
  assertEquals(response.headers.get('access-control-allow-origin'), '*');
  assertEquals(await response.json(), { error: '실패' });
});
