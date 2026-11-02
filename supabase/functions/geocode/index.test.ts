import { assertEquals } from 'jsr:@std/assert';
import { createGeocodeHandler, createGeocoder, nearProvider, type GeocodeDeps } from './index.ts';

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

Deno.test('카카오 조회가 실패하면 502를 돌려줍니다', async () => {
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

Deno.test('nearProvider: 국내 좌표는 카카오, 해외 좌표는 Google을 고릅니다', () => {
  assertEquals(nearProvider({ lat: 37.5665, lng: 126.978 }), 'kakao'); // 서울
  assertEquals(nearProvider({ lat: 33.4996, lng: 126.5312 }), 'kakao'); // 제주
  assertEquals(nearProvider({ lat: 48.8566, lng: 2.3522 }), 'google'); // 파리
  assertEquals(nearProvider({ lat: 35.6762, lng: 139.6503 }), 'google'); // 도쿄
  // 느슨한 사각형을 쓰면 후쿠오카가 국내로 오판돼 카카오에서 빈 결과가 온다.
  assertEquals(nearProvider({ lat: 33.5904, lng: 130.4017 }), 'google'); // 후쿠오카
});

Deno.test('nearProvider: near가 없거나 좌표가 아니면 국내로 간주합니다', () => {
  // 주 사용 환경이 국내이고, 틀렸더라도 지도를 옮긴 뒤 다시 검색하면 올바른 provider로 간다.
  assertEquals(nearProvider(undefined), 'kakao');
  assertEquals(nearProvider(null), 'kakao');
  assertEquals(nearProvider('서울'), 'kakao');
  assertEquals(nearProvider({}), 'kakao');
  assertEquals(nearProvider({ lat: 'x', lng: 'y' }), 'kakao');
  assertEquals(nearProvider({ lat: NaN, lng: 127 }), 'kakao');
});

Deno.test('near 좌표로 고른 provider를 지오코더에 넘깁니다', async () => {
  const seen: string[] = [];
  const handler = createGeocodeHandler(
    makeDeps({
      geocode: async (_address, provider) => {
        seen.push(provider);
        return { lat: 1, lng: 1 };
      },
    }),
  );

  await handler(request({ address: '판교역', near: { lat: 37.5, lng: 127.0 } }));
  await handler(request({ address: 'Eiffel Tower', near: { lat: 48.85, lng: 2.35 } }));

  assertEquals(seen, ['kakao', 'google']);
});

Deno.test('createGeocoder: provider에 따라 카카오/Google 지오코더를 고릅니다', async () => {
  const calls: string[] = [];
  const geocode = createGeocoder(
    async () => {
      calls.push('kakao');
      return { lat: 37.5, lng: 127 };
    },
    async () => {
      calls.push('google');
      return { lat: 48.85, lng: 2.35 };
    },
  );

  assertEquals(await geocode('판교역', 'kakao'), { lat: 37.5, lng: 127 });
  assertEquals(await geocode('Eiffel Tower', 'google'), { lat: 48.85, lng: 2.35 });
  assertEquals(calls, ['kakao', 'google']);
});
