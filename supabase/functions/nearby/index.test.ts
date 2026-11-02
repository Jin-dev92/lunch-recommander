import { assertEquals, assertNotEquals } from 'jsr:@std/assert';
import {
  createGoogleFetcher,
  createKakaoFetcher,
  createNearbyHandler,
  createPlacesFetcher,
  createUsageStore,
  googlePlaceUrl,
} from './index.ts';
import { mapGoogleCategory, splitCategoryName } from '../_shared/category.ts';

Deno.test('사용량 초과는 429입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => false,
    findCached: async () => [],
    fetchPlaces: async () => [],
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
Deno.test('캐시 히트 시 카카오를 호출하지 않습니다', async () => {
  let kakaoCalls = 0;
  const cached = [
    {
      placeId: 'p1',
      name: '식당',
      category: '한식',
      categoryLabel: '육류,고기',
      address: '서울 성북구 테스트로 1',
      lat: 37,
      lng: 127,
      placeUrl: 'https://place.map.kakao.com/p1',
      provider: 'kakao' as const,
      googleRating: null,
      googleRatingsTotal: 0,
      priceLevel: null,
      distanceMeters: 10,
    },
  ];
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => cached,
    fetchPlaces: async () => {
      kakaoCalls++;
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
  assertEquals(kakaoCalls, 0);
  assertEquals((await response.json()).source, 'cache');
});
Deno.test('JWT가 없으면 401입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => [],
    fetchPlaces: async () => [],
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
    fetchPlaces: async () => [],
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
    fetchPlaces: async () => [],
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
    fetchPlaces: async () => [],
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
    fetchPlaces: async () => [],
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
Deno.test('카카오 조회 실패 시 빈 성공 응답이 아니라 오류 상태를 반환합니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => [],
    fetchPlaces: async () => {
      throw new Error('카카오 로컬 API 오류: 503');
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
  '운영 어댑터: 카카오 응답이 non-OK면 오류를 던집니다(빈 성공으로 위장하지 않음)',
  async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'quota exceeded' }), {
        status: 429,
      })) as typeof fetch;
    try {
      const fetchKakao = createKakaoFetcher('fake-key');
      let threw = false;
      try {
        await fetchKakao(37, 127, 500);
      } catch {
        threw = true;
      }
      assertEquals(threw, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test('splitCategoryName: 2단계를 저장 키로, 마지막 단계를 표시 라벨로 씁니다', () => {
  assertEquals(splitCategoryName('음식점 > 한식 > 육류,고기'), {
    category: '한식',
    categoryLabel: '육류,고기',
  });
  // 단계가 2개면 더 구체적인 라벨이 없으므로 저장 키를 그대로 보여준다.
  assertEquals(splitCategoryName('음식점 > 중식'), {
    category: '중식',
    categoryLabel: '중식',
  });
  // 비어 있거나 1단계뿐이면 선호 가중치 키가 흔들리지 않게 '기타'로 떨어뜨린다.
  assertEquals(splitCategoryName('음식점'), { category: '기타', categoryLabel: '기타' });
  assertEquals(splitCategoryName(''), { category: '기타', categoryLabel: '기타' });
});

Deno.test('운영 어댑터: 카카오 응답을 후보로 변환하고 REST 키를 헤더로 보냅니다', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = (async (input: Request | URL | string) => {
    requests.push(new Request(input instanceof Request ? input : String(input)));
    return new Response(
      JSON.stringify({
        documents: [
          {
            id: '26338954',
            place_name: '성북동 고깃집',
            category_name: '음식점 > 한식 > 육류,고기',
            road_address_name: '서울 성북구 테스트로 1',
            address_name: '서울 성북구 성북동1가 1',
            x: '127.0',
            y: '37.0',
            place_url: 'http://place.map.kakao.com/26338954',
          },
        ],
        meta: { is_end: true },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const restaurants = await createKakaoFetcher('fake-key')(37, 127, 500);
    assertEquals(restaurants.length, 1);
    assertEquals(restaurants[0].placeId, '26338954');
    assertEquals(restaurants[0].name, '성북동 고깃집');
    assertEquals(restaurants[0].category, '한식');
    assertEquals(restaurants[0].categoryLabel, '육류,고기');
    // 도로명 주소를 우선한다.
    assertEquals(restaurants[0].address, '서울 성북구 테스트로 1');
    assertEquals(restaurants[0].placeUrl, 'http://place.map.kakao.com/26338954');
    assertEquals(restaurants[0].provider, 'kakao');
    // 카카오 로컬 API에는 평점·리뷰·가격대가 없다.
    assertEquals(restaurants[0].googleRating, null);
    assertEquals(restaurants[0].googleRatingsTotal, 0);
    assertEquals(restaurants[0].priceLevel, null);
    // 카카오는 x가 경도, y가 위도다. 뒤바꾸면 지도가 엉뚱한 곳을 가리킨다.
    assertEquals(restaurants[0].lat, 37);
    assertEquals(restaurants[0].lng, 127);
    // is_end가 true면 두 번째 페이지를 요청하지 않는다.
    assertEquals(requests.length, 1);
    const url = new URL(requests[0].url);
    assertEquals(url.searchParams.get('category_group_code'), 'FD6');
    assertEquals(url.searchParams.get('x'), '127');
    assertEquals(url.searchParams.get('y'), '37');
    assertEquals(url.searchParams.get('radius'), '500');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('mapGoogleCategory: primaryType을 카카오와 같은 한국어 저장 키로 맞춥니다', () => {
  // 같은 키를 쓰므로 국내에서 쌓은 카테고리 선호가 해외에서도 적용된다.
  assertEquals(mapGoogleCategory('korean_restaurant', '한식당'), {
    category: '한식',
    categoryLabel: '한식당',
  });
  assertEquals(mapGoogleCategory('sushi_restaurant', '초밥집').category, '일식');
  assertEquals(mapGoogleCategory('pizza_restaurant', null).category, '양식');
  assertEquals(mapGoogleCategory('wine_bar', null).category, '술집');
  // 목록에 없는 값과 null은 '기타'로 떨어뜨린다(카카오 미등록 카테고리와 같은 취급).
  assertEquals(mapGoogleCategory('zoo', null), { category: '기타', categoryLabel: '기타' });
  assertEquals(mapGoogleCategory(null, null), { category: '기타', categoryLabel: '기타' });
  // 표시 라벨이 있으면 그것을 쓰고, 없으면 저장 키를 그대로 보여준다.
  assertEquals(mapGoogleCategory('zoo', '동물원').categoryLabel, '동물원');
});

Deno.test('googlePlaceUrl: placeId만으로 상세 URL을 조립합니다(추가 API 호출 없음)', () => {
  const url = new URL(googlePlaceUrl('Le Comptoir', 'ChIJabc123'));
  assertEquals(url.origin + url.pathname, 'https://www.google.com/maps/search/');
  assertEquals(url.searchParams.get('query'), 'Le Comptoir');
  assertEquals(url.searchParams.get('query_place_id'), 'ChIJabc123');
});

Deno.test('createPlacesFetcher: provider에 따라 카카오/Google 어댑터를 고릅니다', async () => {
  const calls: string[] = [];
  const fetchPlaces = createPlacesFetcher(
    async () => {
      calls.push('kakao');
      return [];
    },
    async () => {
      calls.push('google');
      return [];
    },
  );

  await fetchPlaces(37.5, 127, 500, 'kakao');
  await fetchPlaces(48.85, 2.35, 500, 'google');

  assertEquals(calls, ['kakao', 'google']);
});

Deno.test('운영 어댑터: Google 응답을 후보로 변환합니다', async () => {
  const originalFetch = globalThis.fetch;
  let fieldMask = '';
  globalThis.fetch = (async (_input: Request | URL | string, init?: RequestInit) => {
    fieldMask = String(new Headers(init?.headers).get('X-Goog-FieldMask') ?? '');
    return new Response(
      JSON.stringify({
        places: [
          {
            id: 'ChIJabc123',
            displayName: { text: 'Le Comptoir' },
            primaryType: 'french_restaurant',
            primaryTypeDisplayName: { text: '프랑스 음식점' },
            formattedAddress: '9 Carrefour de l0Odeon, Paris',
            location: { latitude: 48.8516, longitude: 2.3387 },
            rating: 4.4,
            userRatingCount: 1200,
            priceLevel: 'PRICE_LEVEL_MODERATE',
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const restaurants = await createGoogleFetcher('fake-key')(48.8566, 2.3522, 500);
    assertEquals(restaurants.length, 1);
    assertEquals(restaurants[0].provider, 'google');
    assertEquals(restaurants[0].placeId, 'ChIJabc123');
    assertEquals(restaurants[0].name, 'Le Comptoir');
    // primaryType을 카카오와 같은 한국어 저장 키로 맞춘다.
    assertEquals(restaurants[0].category, '양식');
    assertEquals(restaurants[0].categoryLabel, '프랑스 음식점');
    assertEquals(restaurants[0].googleRating, 4.4);
    assertEquals(restaurants[0].googleRatingsTotal, 1200);
    assertEquals(restaurants[0].priceLevel, 'PRICE_LEVEL_MODERATE');
    assertEquals(restaurants[0].lat, 48.8516);
    assertEquals(restaurants[0].lng, 2.3387);
    // 사진은 호출당 과금되는 별도 SKU라 요청하지 않는다.
    assertEquals(fieldMask.includes('photos'), false);
    assertEquals(fieldMask.includes('places.rating'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('운영 어댑터: Google 응답이 non-OK면 오류를 던집니다', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'quota' }), { status: 429 })) as typeof fetch;
  try {
    let threw = false;
    try {
      await createGoogleFetcher('fake-key')(48.85, 2.35, 500);
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
