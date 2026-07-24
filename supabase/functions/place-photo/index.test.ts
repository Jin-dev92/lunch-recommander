import { assertEquals } from 'jsr:@std/assert';
import { createPlacePhotoHandler, type PlacePhotoDeps } from './index.ts';

const VALID_NAME = 'places/ChIJabc/photos/AXYZ_123-def';

function makeDeps(overrides: Partial<PlacePhotoDeps> = {}): PlacePhotoDeps {
  return {
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    fetchPhotoUri: async () => 'https://lh3.googleusercontent.com/photo',
    ...overrides,
  };
}

function request(body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) {
  return new Request('https://edge.example.com/place-photo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test('유효한 사진 이름이면 photoUri를 돌려줍니다', async () => {
  let askedFor: string | undefined;
  const handler = createPlacePhotoHandler(
    makeDeps({
      fetchPhotoUri: async (name) => {
        askedFor = name;
        return 'https://lh3.googleusercontent.com/photo';
      },
    }),
  );
  const response = await handler(request({ photoName: VALID_NAME }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { photoUri: 'https://lh3.googleusercontent.com/photo' });
  assertEquals(askedFor, VALID_NAME);
});

Deno.test('인증 헤더가 없으면 401을 돌려줍니다', async () => {
  const handler = createPlacePhotoHandler(makeDeps());
  const response = await handler(request({ photoName: VALID_NAME }, {}));
  assertEquals(response.status, 401);
});

Deno.test('레이트리밋을 초과하면 429를 돌려주고 사진을 조회하지 않습니다', async () => {
  let fetched = false;
  const handler = createPlacePhotoHandler(
    makeDeps({
      checkLimit: async () => false,
      fetchPhotoUri: async () => {
        fetched = true;
        return 'x';
      },
    }),
  );
  const response = await handler(request({ photoName: VALID_NAME }));
  assertEquals(response.status, 429);
  assertEquals(fetched, false);
});

Deno.test('사진 이름 형식이 어긋나면 400을 돌려주고 조회하지 않습니다', async () => {
  // 경로 주입(../, 절대 URL 등)이 Google 미디어 URL에 이어 붙는 것을 막는다.
  for (const bad of ['', 'not-a-name', 'places/abc', '../../etc', 'https://evil/x']) {
    let fetched = false;
    const handler = createPlacePhotoHandler(
      makeDeps({
        fetchPhotoUri: async () => {
          fetched = true;
          return 'x';
        },
      }),
    );
    const response = await handler(request({ photoName: bad }));
    assertEquals(response.status, 400, `입력: ${bad}`);
    assertEquals(fetched, false, `입력: ${bad}`);
  }
});

Deno.test('사진이 없으면 404를 돌려줍니다', async () => {
  const handler = createPlacePhotoHandler(makeDeps({ fetchPhotoUri: async () => null }));
  const response = await handler(request({ photoName: VALID_NAME }));
  assertEquals(response.status, 404);
});

Deno.test('Google 조회가 실패하면 502를 돌려줍니다', async () => {
  const handler = createPlacePhotoHandler(
    makeDeps({
      fetchPhotoUri: async () => {
        throw new Error('boom');
      },
    }),
  );
  const response = await handler(request({ photoName: VALID_NAME }));
  assertEquals(response.status, 502);
});
