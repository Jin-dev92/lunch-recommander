import { assertEquals } from 'jsr:@std/assert';
import { createGeocodeHandler, type GeocodeDeps } from './index.ts';

function makeDeps(overrides: Partial<GeocodeDeps> = {}): GeocodeDeps {
  return {
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    geocode: async () => ({ lat: 37.5, lng: 127.0 }),
    ...overrides,
  };
}

function request(body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) {
  return new Request('https://edge.example.com/geocode', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test('주소를 좌표로 변환해 돌려줍니다', async () => {
  let askedFor: string | undefined;
  const handler = createGeocodeHandler(
    makeDeps({
      geocode: async (address) => {
        askedFor = address;
        return { lat: 37.6, lng: 127.1 };
      },
    }),
  );
  const response = await handler(request({ address: '  서울 성북구 성북로  ' }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { lat: 37.6, lng: 127.1 });
  // 앞뒤 공백은 다듬어 넘긴다.
  assertEquals(askedFor, '서울 성북구 성북로');
});

Deno.test('인증 헤더가 없으면 401을 돌려줍니다', async () => {
  const handler = createGeocodeHandler(makeDeps());
  const response = await handler(request({ address: '서울' }, {}));
  assertEquals(response.status, 401);
});

Deno.test('레이트리밋을 초과하면 429를 돌려주고 지오코딩하지 않습니다', async () => {
  let called = false;
  const handler = createGeocodeHandler(
    makeDeps({
      checkLimit: async () => false,
      geocode: async () => {
        called = true;
        return { lat: 0, lng: 0 };
      },
    }),
  );
  const response = await handler(request({ address: '서울' }));
  assertEquals(response.status, 429);
  assertEquals(called, false);
});

Deno.test('빈 주소나 지나치게 긴 주소는 400을 돌려주고 지오코딩하지 않습니다', async () => {
  for (const address of ['', '   ', 'a'.repeat(201)]) {
    let called = false;
    const handler = createGeocodeHandler(
      makeDeps({
        geocode: async () => {
          called = true;
          return { lat: 0, lng: 0 };
        },
      }),
    );
    const response = await handler(request({ address }));
    assertEquals(response.status, 400, `입력 길이: ${address.length}`);
    assertEquals(called, false);
  }
});

Deno.test('주소를 찾지 못하면 404를 돌려줍니다', async () => {
  const handler = createGeocodeHandler(makeDeps({ geocode: async () => null }));
  const response = await handler(request({ address: '없는주소zzz' }));
  assertEquals(response.status, 404);
});

Deno.test('Google 조회가 실패하면 502를 돌려줍니다', async () => {
  const handler = createGeocodeHandler(
    makeDeps({
      geocode: async () => {
        throw new Error('boom');
      },
    }),
  );
  const response = await handler(request({ address: '서울' }));
  assertEquals(response.status, 502);
});
