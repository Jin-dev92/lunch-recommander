import { assertEquals, assertNotEquals } from 'jsr:@std/assert';
import { createNearbyHandler, createUsageStore, createGoogleFetcher } from './index.ts';

Deno.test('사용량 초과는 429입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => false,
    findCached: async () => [],
    fetchGoogle: async () => [],
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 429);
});
Deno.test('캐시 히트 시 Google을 호출하지 않습니다', async () => {
  let googleCalls = 0;
  const cached = [
    {
      placeId: 'p1',
      name: '식당',
      category: '한식',
      lat: 37,
      lng: 127,
      googleRating: 4,
      googleRatingsTotal: 20,
      distanceMeters: 10,
    },
  ];
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => cached,
    fetchGoogle: async () => {
      googleCalls++;
      return [];
    },
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(googleCalls, 0);
  assertEquals((await response.json()).source, 'cache');
});
Deno.test('JWT가 없으면 401입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => [],
    fetchGoogle: async () => [],
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 401);
});
Deno.test('JWT가 유효하지 않으면 401입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => null,
    checkLimit: async () => true,
    findCached: async () => [],
    fetchGoogle: async () => [],
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid-jwt',
        'x-forwarded-for': '127.0.0.1',
      },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 401);
});
Deno.test('본문이 올바른 JSON이 아니면 400입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => [],
    fetchGoogle: async () => [],
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
      body: '{not json',
    }),
  );
  assertEquals(response.status, 400);
});
Deno.test('100m와 300m 검색 반경을 허용합니다', async () => {
  const received: number[] = [];
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async (_lat, _lng, radius) => {
      received.push(radius);
      return [];
    },
    fetchGoogle: async () => [],
    upsert: async () => {},
  });

  for (const radius of [100, 300]) {
    const response = await handler(
      new Request('http://local', {
        method: 'POST',
        headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ lat: 37, lng: 127, radius }),
      }),
    );
    assertEquals(response.status, 200);
  }
  assertEquals(received, [100, 300]);
});
Deno.test('허용 목록에 없는 검색 반경은 400입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => [],
    fetchGoogle: async () => [],
    upsert: async () => {},
  });

  for (const radius of [200, 2000]) {
    const response = await handler(
      new Request('http://local', {
        method: 'POST',
        headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ lat: 37, lng: 127, radius }),
      }),
    );
    assertEquals(response.status, 400);
  }
});
Deno.test('Google 조회 실패 시 빈 성공 응답이 아니라 오류 상태를 반환합니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => [],
    fetchGoogle: async () => {
      throw new Error('Google Places API 오류: 503');
    },
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: {
        authorization: 'Bearer jwt',
        'x-forwarded-for': '127.0.0.1',
      },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 502);
  assertNotEquals(response.status, 200);
});

Deno.test(
  '운영 어댑터: usageStore는 select+upsert가 아니라 원자적 RPC(increment_api_usage)를 호출합니다',
  async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const store = createUsageStore({
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return { data: 1, error: null };
      },
    });
    const count = await store.increment({
      userId: 'u1',
      ip: '1.1.1.1',
      windowStart: '2026-01-01T00:00:00.000Z',
    });
    assertEquals(count, 1);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].fn, 'increment_api_usage');
    assertEquals(calls[0].args, {
      p_user_id: 'u1',
      p_ip: '1.1.1.1',
      p_window_start: '2026-01-01T00:00:00.000Z',
    });
  },
);

Deno.test(
  '운영 어댑터: 동시 요청도 원자적 RPC라면 서로 다른 카운트를 받습니다(경합 없음)',
  async () => {
    // DB의 `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`를 모사: 같은 key에 대한 호출은 직렬화되어 카운트가 겹치지 않음
    const counters = new Map<string, number>();
    const store = createUsageStore({
      rpc: async (_fn, args) => {
        const key = `${args.p_user_id}|${args.p_ip}|${args.p_window_start}`;
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return { data: next, error: null };
      },
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.increment({
          userId: 'u1',
          ip: '1.1.1.1',
          windowStart: '2026-01-01T00:00:00.000Z',
        }),
      ),
    );
    assertEquals(new Set(results).size, 10); // 10개 모두 서로 다른 카운트 -> 유실 없음
    assertEquals(
      [...results].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  },
);

Deno.test(
  '운영 어댑터: Google 응답이 non-OK면 오류를 던집니다(빈 성공으로 위장하지 않음)',
  async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'quota exceeded' }), {
        status: 429,
      })) as typeof fetch;
    try {
      const fetchGoogle = createGoogleFetcher('fake-key');
      let threw = false;
      try {
        await fetchGoogle(37, 127, 500);
      } catch {
        threw = true;
      }
      assertEquals(threw, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
